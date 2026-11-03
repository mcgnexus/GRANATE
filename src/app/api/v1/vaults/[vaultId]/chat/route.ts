import type { NextRequest } from "next/server";
import { withVault, apiError } from "@/lib/http";
import { retrieveContext } from "@/lib/ai/rag";
import { checkQuota, recordUsage, streamChat, tokenEstimate } from "@/lib/ai/llm";
import type { ChatMessage } from "@/lib/ai/llm";
import { config } from "@/lib/config";

type Ctx = { params: Promise<{ vaultId: string }> };

export async function POST(request: NextRequest, ctx: Ctx) {
  try {
    const { vaultId } = await ctx.params;
    const access = await withVault(request, vaultId);
    if ("response" in access) return access.response;

    if (!config.hasLlm) {
      return Response.json(
        { error: "Falta OPENROUTER_API_KEY para usar el chat." },
        { status: 400 },
      );
    }

    await checkQuota(access.user.id);

    const body = (await request.json()) as {
      question?: string;
      history?: Array<{ role: "user" | "assistant"; content: string }>;
    };
    const question = body.question?.trim();
    if (!question) return Response.json({ error: "Falta la pregunta" }, { status: 400 });

    const { citations, messages } = await retrieveContext(vaultId, question);
    const history = (body.history ?? []).slice(-6);
    const withHistory: ChatMessage[] = [
      messages[0],
      ...history.map((item) => ({ role: item.role, content: item.content }) as ChatMessage),
      messages[1],
    ];

    const upstream = await streamChat(withHistory);
    const encoder = new TextEncoder();
    const reader = upstream.getReader();
    const promptTokens = tokenEstimate(withHistory);
    let completionChars = 0;
    let closed = false;

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "citations", citations })}\n\n`),
        );
      },
      async pull(controller) {
        if (closed) return;
        const { done, value } = await reader.read();
        if (done) {
          closed = true;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
          controller.close();
          const completionTokens = Math.ceil(completionChars / 4);
          void recordUsage({
            userId: access.user.id,
            vaultId,
            kind: "chat",
            model: config.llmModel,
            promptTokens,
            completionTokens,
          }).catch((error) => console.error("[GRANATE] usage", error));
          return;
        }
        const text = new TextDecoder().decode(value);
        completionChars += text.length;
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "delta", text })}\n\n`),
        );
      },
      cancel() {
        closed = true;
        void reader.cancel();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
