import type { NextRequest } from "next/server";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { notes, shareLinks } from "@/lib/db/schema";
import { withVault, apiError } from "@/lib/http";
import { randomToken } from "@/lib/auth/password";

type Ctx = { params: Promise<{ vaultId: string }> };

export async function GET(request: NextRequest, ctx: Ctx) {
  try {
    const { vaultId } = await ctx.params;
    const access = await withVault(request, vaultId);
    if ("response" in access) return access.response;

    const noteId = request.nextUrl.searchParams.get("noteId");
    const rows = await db
      .select({
        id: shareLinks.id,
        token: shareLinks.token,
        noteId: shareLinks.noteId,
        notePath: notes.path,
        expiresAt: shareLinks.expiresAt,
        revokedAt: shareLinks.revokedAt,
        createdAt: shareLinks.createdAt,
      })
      .from(shareLinks)
      .leftJoin(notes, eq(shareLinks.noteId, notes.id))
      .where(
        and(
          eq(shareLinks.vaultId, vaultId),
          noteId ? eq(shareLinks.noteId, noteId) : isNull(shareLinks.noteId),
        ),
      )
      .orderBy(desc(shareLinks.createdAt));

    return Response.json({
      shares: rows.map((row) => ({
        ...row,
        url: `${request.nextUrl.origin}/s/${row.token}`,
      })),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest, ctx: Ctx) {
  try {
    const { vaultId } = await ctx.params;
    const access = await withVault(request, vaultId, true);
    if ("response" in access) return access.response;

    const body = (await request.json().catch(() => ({}))) as {
      noteId?: string;
      expiresInDays?: number;
      vault?: boolean;
    };

    if (body.noteId) {
      const [note] = await db
        .select({ id: notes.id })
        .from(notes)
        .where(
          and(
            eq(notes.vaultId, vaultId),
            eq(notes.id, body.noteId),
            isNull(notes.deletedAt),
          ),
        )
        .limit(1);
      if (!note) return Response.json({ error: "Nota no encontrada" }, { status: 404 });
    } else {
      // Un enlace de bóveda completa solo puede crearlo el propietario.
      if (access.vault.role !== "owner") {
        return Response.json({ error: "Solo el propietario puede compartir la bóveda completa" }, { status: 403 });
      }
    }

    const days = Number(body.expiresInDays ?? 0);
    const expiresAt =
      Number.isFinite(days) && days > 0
        ? new Date(Date.now() + Math.min(days, 3650) * 86_400_000)
        : null;
    const token = randomToken(24);

    const [row] = await db
      .insert(shareLinks)
      .values({
        vaultId,
        noteId: body.noteId ?? null,
        token,
        createdBy: access.user.id,
        expiresAt,
      })
      .returning();

    return Response.json({
      share: { ...row, url: `${request.nextUrl.origin}/s/${row.token}` },
    });
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
    const token = request.nextUrl.searchParams.get("token");
    if (!id && !token) return Response.json({ error: "Falta id o token" }, { status: 400 });

    await db
      .update(shareLinks)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(shareLinks.vaultId, vaultId),
          id ? eq(shareLinks.id, id) : eq(shareLinks.token, token ?? ""),
        ),
      );
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
