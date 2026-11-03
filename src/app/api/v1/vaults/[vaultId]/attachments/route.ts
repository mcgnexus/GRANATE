import type { NextRequest } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { attachments } from "@/lib/db/schema";
import { withVault, apiError } from "@/lib/http";
import { guessMime } from "@/lib/import-export";
import { contentHash } from "@/lib/auth/password";

type Ctx = { params: Promise<{ vaultId: string }> };

const MAX_BYTES = 10 * 1024 * 1024;

export async function GET(request: NextRequest, ctx: Ctx) {
  try {
    const { vaultId } = await ctx.params;
    const access = await withVault(request, vaultId);
    if ("response" in access) return access.response;

    const path = request.nextUrl.searchParams.get("path");
    const id = request.nextUrl.searchParams.get("id");
    if (!path && !id) return Response.json({ error: "Falta path o id" }, { status: 400 });

    const [row] = await db
      .select()
      .from(attachments)
      .where(
        and(
          eq(attachments.vaultId, vaultId),
          id ? eq(attachments.id, id) : sql`lower(${attachments.path}) = ${(path ?? "").toLowerCase()}`,
        ),
      )
      .limit(1);

    if (!row?.data) return Response.json({ error: "Adjunto no encontrado" }, { status: 404 });

    const bytes = Buffer.from(row.data, "base64");
    return new Response(bytes as unknown as BodyInit, {
      headers: {
        "Content-Type": row.mime,
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "private, max-age=3600",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "X-Content-Type-Options": "nosniff",
      },
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

    const form = await request.formData();
    const file = form.get("file");
    const path = form.get("path");
    if (!(file instanceof File) || typeof path !== "string") {
      return Response.json({ error: "Faltan file o path" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return Response.json({ error: "El archivo supera 10 MB" }, { status: 413 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const base64 = bytes.toString("base64");
    const sha = contentHash(base64);

    await db
      .insert(attachments)
      .values({
        vaultId,
        path,
        mime: file.type || guessMime(path),
        size: bytes.byteLength,
        sha256: sha,
        data: base64,
      })
      .onConflictDoNothing();

    return Response.json({ ok: true, path, url: `/api/v1/vaults/${vaultId}/attachments?path=${encodeURIComponent(path)}` });
  } catch (error) {
    return apiError(error);
  }
}
