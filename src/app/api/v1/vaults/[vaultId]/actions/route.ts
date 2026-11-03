import type { NextRequest } from "next/server";
import { withVault, apiError } from "@/lib/http";
import { getNote } from "@/lib/notes";
import { isNoteAction, runNoteAction } from "@/lib/ai/actions";
import { checkQuota, recordUsage, tokenEstimate } from "@/lib/ai/llm";
import { config } from "@/lib/config";

type Ctx = { params: Promise<{ vaultId: string }> };

export async function POST(request: NextRequest, ctx: Ctx) {
  try {
    const { vaultId } = await ctx.params;
    const access = await withVault(request, vaultId, true);
    if ("response" in access) return access.response;

    if (!config.hasLlm) {
      return Response.json({ error: "Falta OPENROUTER_API_KEY." }, { status: 400 });
    }

    const body = (await request.json()) as { noteId?: string; action?: string };
    if (!body.noteId || !body.action || !isNoteAction(body.action)) {
      return Response.json({ error: "Acción no válida" }, { status: 400 });
    }

    await checkQuota(access.user.id);
    const note = await getNote(vaultId, body.noteId);
    if (!note) return Response.json({ error: "Nota no encontrada" }, { status: 404 });

    const result = await runNoteAction(body.action, {
      title: note.title,
      path: note.path,
      content: note.content,
    });

    void recordUsage({
      userId: access.user.id,
      vaultId,
      kind: `action:${body.action}`,
      model: config.llmModel,
      promptTokens: tokenEstimate([{ role: "user", content: note.content }]),
      completionTokens: Math.ceil(result.length / 4),
    }).catch(() => undefined);

    return Response.json({ action: body.action, result });
  } catch (error) {
    return apiError(error);
  }
}
