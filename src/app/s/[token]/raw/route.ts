import type { NextRequest } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { attachments, shareLinks } from "@/lib/db/schema";

type Ctx = { params: Promise<{ token: string }> };

export async function GET(request: NextRequest, ctx: Ctx) {
  const { token } = await ctx.params;
  const path = request.nextUrl.searchParams.get("path");
  if (!path) return new Response("Falta path", { status: 400 });

  const [share] = await db
    .select({
      vaultId: shareLinks.vaultId,
      expiresAt: shareLinks.expiresAt,
      revokedAt: shareLinks.revokedAt,
    })
    .from(shareLinks)
    .where(eq(shareLinks.token, token))
    .limit(1);

  if (!share || share.revokedAt || (share.expiresAt && share.expiresAt.getTime() < Date.now())) {
    return new Response("Enlace no válido", { status: 404 });
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
