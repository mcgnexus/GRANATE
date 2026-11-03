import { config, getEnv } from "@/lib/config";

const BASE = "https://generativelanguage.googleapis.com/v1beta";

type GeminiEmbeddingResponse = {
  embedding?: { values?: number[] };
  embeddings?: Array<{ values?: number[] }>;
};

async function callGemini<T>(path: string, body: unknown): Promise<T> {
  const key = getEnv("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY no configurada");
  const response = await fetch(`${BASE}/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": key,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Gemini embeddings ${response.status}: ${detail.slice(0, 300)}`);
  }
  return (await response.json()) as T;
}

const dimensions = () => config.embeddingDimensions;

export async function embedQuery(text: string): Promise<string> {
  const data = await callGemini<GeminiEmbeddingResponse>(
    `models/${config.embeddingModel}:embedContent`,
    {
      model: `models/${config.embeddingModel}`,
      content: { parts: [{ text: text.slice(0, 8000) }] },
      taskType: "RETRIEVAL_QUERY",
      outputDimensionality: dimensions(),
    },
  );
  const values = data.embedding?.values ?? [];
  if (!values.length) throw new Error("Gemini devolvió un embedding vacío");
  return `[${values.join(",")}]`;
}

export async function embedDocuments(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const data = await callGemini<GeminiEmbeddingResponse>(
    `models/${config.embeddingModel}:batchEmbedContents`,
    {
      requests: texts.map((text) => ({
        model: `models/${config.embeddingModel}`,
        content: { parts: [{ text: text.slice(0, 8000) }] },
        taskType: "RETRIEVAL_DOCUMENT",
        outputDimensionality: dimensions(),
      })),
    },
  );
  const embeddings = data.embeddings ?? [];
  return embeddings.map((item) => item.values ?? []);
}
