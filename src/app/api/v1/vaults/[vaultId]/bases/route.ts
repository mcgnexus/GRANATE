import type { NextRequest } from "next/server";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { bases, noteTags, notes, tags } from "@/lib/db/schema";
import { withVault, apiError } from "@/lib/http";
import { evaluateBase, parseBase, type BaseNote } from "@/lib/bases";

type Ctx = { params: Promise<{ vaultId: string }> };

async function loadBaseNotes(vaultId: string): Promise<BaseNote[]> {
  const [noteRows, tagRows] = await Promise.all([
    db
      .select({
        id: notes.id,
        path: notes.path,
        title: notes.title,
        frontmatter: notes.frontmatter,
      })
      .from(notes)
      .where(and(eq(notes.vaultId, vaultId), isNull(notes.deletedAt))),
    db
      .select({ noteId: noteTags.noteId, name: tags.name })
      .from(noteTags)
      .innerJoin(tags, eq(tags.id, noteTags.tagId))
      .where(eq(tags.vaultId, vaultId)),
  ]);

  return noteRows.map((note) => ({
    ...note,
    frontmatter: note.frontmatter ?? {},
    tags: tagRows.filter((tag) => tag.noteId === note.id).map((tag) => tag.name),
  }));
}

export async function GET(request: NextRequest, ctx: Ctx) {
  try {
    const { vaultId } = await ctx.params;
    const access = await withVault(request, vaultId);
    if ("response" in access) return access.response;

    const path = request.nextUrl.searchParams.get("path");
    const view = request.nextUrl.searchParams.get("view") ?? undefined;

    if (!path) {
      const rows = await db
        .select({ id: bases.id, path: bases.path, updatedAt: bases.updatedAt })
        .from(bases)
        .where(eq(bases.vaultId, vaultId));
      return Response.json({ bases: rows });
    }

    const [base] = await db
      .select()
      .from(bases)
      .where(and(eq(bases.vaultId, vaultId), sql`lower(${bases.path}) = ${path.toLowerCase()}`))
      .limit(1);
    if (!base) return Response.json({ error: "Base no encontrada" }, { status: 404 });

    const parsed = parseBase(base.raw);
    const noteList = await loadBaseNotes(vaultId);
    const result = evaluateBase(parsed, noteList, view);

    return Response.json({ base, parsed: { views: parsed.views, filters: parsed.filters }, result });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest, ctx: Ctx) {
  try {
    const { vaultId } = await ctx.params;
    const access = await withVault(request, vaultId, true);
    if ("response" in access) return access.response;

    const body = (await request.json()) as { path?: string; raw?: string };
    if (!body.path || !body.path.toLowerCase().endsWith(".base")) {
      return Response.json({ error: "Ruta .base no válida" }, { status: 400 });
    }

    const existing = await db
      .select({ id: bases.id })
      .from(bases)
      .where(
        and(eq(bases.vaultId, vaultId), sql`lower(${bases.path}) = ${body.path.toLowerCase()}`),
      )
      .limit(1);

    if (existing[0]) {
      await db
        .update(bases)
        .set({ raw: body.raw ?? "", config: parseBase(body.raw ?? "") as unknown as Record<string, unknown>, updatedAt: new Date() })
        .where(eq(bases.id, existing[0].id));
    } else {
      await db.insert(bases).values({
        vaultId,
        path: body.path,
        raw: body.raw ?? "",
        config: parseBase(body.raw ?? "") as unknown as Record<string, unknown>,
      });
    }

    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  try {
    const { vaultId } = await ctx.params;
    const access = await withVault(request, vaultId, true);
    if ("response" in access) return access.response;
    const id = request.nextUrl.searchParams.get("id");
    if (!id) return Response.json({ error: "Falta id" }, { status: 400 });
    await db.delete(bases).where(and(eq(bases.vaultId, vaultId), eq(bases.id, id)));
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
