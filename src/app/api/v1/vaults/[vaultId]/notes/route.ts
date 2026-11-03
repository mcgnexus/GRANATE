import type { NextRequest } from "next/server";
import { z } from "zod";
import { withVault, apiError } from "@/lib/http";
import { createNote, getNoteByPath, listNotes } from "@/lib/notes";

type Ctx = { params: Promise<{ vaultId: string }> };

const createSchema = z.object({
  path: z.string().min(1).max(500),
  content: z.string().max(2_000_000).optional(),
});

export async function GET(request: NextRequest, ctx: Ctx) {
  try {
    const { vaultId } = await ctx.params;
    const access = await withVault(request, vaultId);
    if ("response" in access) return access.response;

    const path = request.nextUrl.searchParams.get("path");
    if (path) {
      const note = await getNoteByPath(vaultId, path);
      if (!note) return Response.json({ error: "Nota no encontrada" }, { status: 404 });
      return Response.json({ note });
    }

    const includeDeleted = request.nextUrl.searchParams.get("trash") === "1";
    return Response.json({ notes: await listNotes(vaultId, includeDeleted) });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest, ctx: Ctx) {
  try {
    const { vaultId } = await ctx.params;
    const access = await withVault(request, vaultId, true);
    if ("response" in access) return access.response;

    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "Datos no válidos" }, { status: 400 });

    const existing = await getNoteByPath(vaultId, parsed.data.path);
    if (existing) return Response.json({ error: "Ya existe una nota en esa ruta" }, { status: 409 });

    const note = await createNote({
      vaultId,
      userId: access.user.id,
      path: parsed.data.path,
      content: parsed.data.content,
      source: "api",
    });

    return Response.json({ note });
  } catch (error) {
    return apiError(error);
  }
}
