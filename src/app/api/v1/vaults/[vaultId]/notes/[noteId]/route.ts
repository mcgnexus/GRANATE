import type { NextRequest } from "next/server";
import { after } from "next/server";
import { z } from "zod";
import { withVault, apiError } from "@/lib/http";
import {
  deleteNote,
  getNote,
  getNoteByPath,
  updateNote,
} from "@/lib/notes";

type Ctx = { params: Promise<{ vaultId: string; noteId: string }> };

const patchSchema = z.object({
  content: z.string().max(2_000_000).optional(),
  path: z.string().min(1).max(500).optional(),
  frontmatter: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(request: NextRequest, ctx: Ctx) {
  try {
    const { vaultId, noteId } = await ctx.params;
    const access = await withVault(request, vaultId);
    if ("response" in access) return access.response;

    const note = noteId.includes(".") && !noteId.match(/^[0-9a-f-]{36}$/i)
      ? await getNoteByPath(vaultId, noteId)
      : await getNote(vaultId, noteId);

    if (!note) return Response.json({ error: "Nota no encontrada" }, { status: 404 });
    return Response.json({ note });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  try {
    const { vaultId, noteId } = await ctx.params;
    const access = await withVault(request, vaultId, true);
    if ("response" in access) return access.response;

    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "Datos no válidos" }, { status: 400 });

    const note = await updateNote({
      vaultId,
      noteId,
      userId: access.user.id,
      ...parsed.data,
      source: "api",
    });

    after(async () => {
      try {
        const { indexNote } = await import("@/lib/ai/indexer");
        await indexNote(note.id);
      } catch (error) {
        console.error("[GRANATE] index", error);
      }
    });

    const detail = await getNote(vaultId, note.id);
    return Response.json({ note: detail ?? note });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  try {
    const { vaultId, noteId } = await ctx.params;
    const access = await withVault(request, vaultId, true);
    if ("response" in access) return access.response;

    const restored = request.nextUrl.searchParams.get("restore") === "1";
    if (restored) {
      const { restoreNote } = await import("@/lib/notes");
      await restoreNote(vaultId, noteId);
    } else {
      await deleteNote(vaultId, noteId);
    }
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
