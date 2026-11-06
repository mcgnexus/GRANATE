import type { NextRequest } from "next/server";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { attachments, notes, shareLinks } from "@/lib/db/schema";
import { b2KeyFromRef, isB2Ref, signedB2Url } from "@/lib/storage";

type Ctx = { params: Promise<{ token: string }> };

export async function GET(request: NextRequest, ctx: Ctx) {
  const { token } = await ctx.params;
  const path = request.nextUrl.searchParams.get("path");
  if (!path) return new Response("Falta path", { status: 400 });

  const [share] = await db
    .select({
      vaultId: shareLinks.vaultId,
      noteId: shareLinks.noteId,
      expiresAt: shareLinks.expiresAt,
      revokedAt: shareLinks.revokedAt,
    })
    .from(shareLinks)
    .where(eq(shareLinks.token, token))
    .limit(1);

  if (!share || share.revokedAt || (share.expiresAt && share.expiresAt.getTime() < Date.now())) {
    return new Response("Enlace no válido", { status: 404 });
  }

  if (share.noteId) {
    // Un enlace de una sola nota solo autoriza los adjuntos que esa nota
    // referencia; además la nota debe seguir activa.
    const [note] = await db
      .select({ content: notes.content })
      .from(notes)
      .where(and(eq(notes.id, share.noteId), isNull(notes.deletedAt)))
      .limit(1);
    if (!note) return new Response("Enlace no válido", { status: 404 });

    let haystack = note.content.toLowerCase();
    try {
      haystack = decodeURIComponent(haystack);
    } catch {
      // contenido con % literal sin codificar: se usa tal cual
    }
    if (!haystack.includes(path.toLowerCase())) {
      return new Response("Adjunto no encontrado", { status: 404 });
    }
  }

  const [row] = await db
    .select()
    .from(attachments)
    .where(
      and(
        eq(attachments.vaultId, share.vaultId),
        sql`lower(${attachments.path}) = ${path.toLowerCase()}`,
      ),
    )
    .limit(1);

  if (!row) return new Response("Adjunto no encontrado", { status: 404 });
  if (isB2Ref(row.blobUrl)) {
    return Response.redirect(await signedB2Url(b2KeyFromRef(row.blobUrl), 3600), 307);
  }
  if (row.blobUrl) return Response.redirect(row.blobUrl, 307);
  if (!row.data) return new Response("Adjunto no encontrado", { status: 404 });

  const bytes = Buffer.from(row.data, "base64");
  return new Response(bytes as unknown as BodyInit, {
    headers: {
      "Content-Type": row.mime,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
