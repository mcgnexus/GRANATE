import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { config, getEnv } from "@/lib/config";
import { estimateTokens } from "@/lib/markdown/chunk";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

function headers() {
  const key = getEnv("OPENROUTER_API_KEY");
  if (!key) throw new Error("OPENROUTER_API_KEY no configurada");
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    "HTTP-Referer": getEnv("APP_URL") ?? "http://localhost:3000",
    "X-Title": "GRANATE",
  };
}

export async function checkQuota(userId: string) {
  const day = new Date().toISOString().slice(0, 10);
  const result = await db.execute(sql`
    select tokens from usage_quotas where user_id = ${userId} and day = ${day}::date
  `);
  const list = Array.isArray(result)
    ? (result as Array<Record<string, unknown>>)
    : ((result as unknown as { rows?: Array<Record<string, unknown>> }).rows ?? []);
  const used = Number((list[0] as { tokens?: number } | undefined)?.tokens ?? 0);
  if (used >= config.dailyTokenQuota) {
    throw new Error(
      `Has alcanzado la cuota diaria de ${config.dailyTokenQuota.toLocaleString("es-ES")} tokens. Vuelve mañana.`,
    );
  }
  return { used, limit: config.dailyTokenQuota };
}

export async function recordUsage(input: {
  userId: string;
  vaultId?: string;
  kind: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
}) {
  const day = new Date().toISOString().slice(0, 10);
  const total = input.promptTokens + input.completionTokens;

  await db.execute(sql`
    insert into usage_quotas (user_id, day, tokens, requests)
    values (${input.userId}, ${day}::date, ${total}, 1)
    on conflict (user_id, day)
    do update set tokens = usage_quotas.tokens + ${total}, requests = usage_quotas.requests + 1
  `);

  await db.execute(sql`
    insert into llm_runs
      (user_id, vault_id, kind, model, prompt_tokens, completion_tokens, cost_usd, status)
    values
      (${input.userId}, ${input.vaultId ?? null}, ${input.kind}, ${input.model},
       ${input.promptTokens}, ${input.completionTokens}, 0, 'ok')
  `);
}

export async function completeChat(
  messages: ChatMessage[],
  options: { maxTokens?: number; temperature?: number; model?: string } = {},
): Promise<string> {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      model: options.model ?? config.llmModel,
      messages,
      max_tokens: options.maxTokens ?? 2000,
      temperature: options.temperature ?? 0.4,
      stream: false,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenRouter ${response.status}: ${detail.slice(0, 300)}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  return data.choices?.[0]?.message?.content ?? "";
}

export async function streamChat(
  messages: ChatMessage[],
  options: { maxTokens?: number; temperature?: number; model?: string } = {},
): Promise<ReadableStream<Uint8Array>> {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      model: options.model ?? config.llmModel,
      messages,
      max_tokens: options.maxTokens ?? 2000,
      temperature: options.temperature ?? 0.4,
      stream: true,
    }),
    cache: "no-store",
  });

  if (!response.ok || !response.body) {
    const detail = await response.text();
    throw new Error(`OpenRouter ${response.status}: ${detail.slice(0, 300)}`);
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const reader = response.body.getReader();

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === "[DONE]") {
            controller.close();
            return;
          }
          try {
            const json = JSON.parse(payload) as {
              choices?: Array<{ delta?: { content?: string } }>;
            };
            const delta = json.choices?.[0]?.delta?.content;
            if (delta) controller.enqueue(encoder.encode(delta));
          } catch {
            // Ignore keep-alive fragments.
          }
        }
      }
    },
    cancel() {
      void reader.cancel();
    },
  });
}

export function tokenEstimate(messages: ChatMessage[]): number {
  return messages.reduce((total, message) => total + estimateTokens(message.content), 0);
}
