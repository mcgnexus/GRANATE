import type { NextRequest } from "next/server";
import { withVault, apiError } from "@/lib/http";
import { reindexVault } from "@/lib/notes";
import { config } from "@/lib/config";

type Ctx = { params: Promise<{ vaultId: string }> };

export async function GET(request: NextRequest, ctx: Ctx) {
  const { vaultId } = await ctx.params;
  const access = await withVault(request, vaultId);
  if ("response" in access) return access.response;
  return Response.json({ embeddings: config.hasEmbeddings, llm: config.hasLlm });
}

export async function POST(request: NextRequest, ctx: Ctx) {
  try {
    const { vaultId } = await ctx.params;
    const access = await withVault(request, vaultId, true);
    if ("response" in access) return access.response;

    if (!config.hasEmbeddings) {
      return Response.json(
        { error: "Falta GEMINI_API_KEY para generar embeddings." },
        { status: 400 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as { limit?: number };
    const count = await reindexVault(vaultId, Math.min(Number(body.limit ?? 10), 50));
    return Response.json({ ok: true, indexed: count });
  } catch (error) {
    return apiError(error);
  }
}
