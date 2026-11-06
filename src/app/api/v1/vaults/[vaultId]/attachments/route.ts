import type { NextRequest } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { put } from "@vercel/blob";
import { db } from "@/lib/db";
import { attachments } from "@/lib/db/schema";
import { withVault, apiError } from "@/lib/http";
import { guessMime } from "@/lib/import-export";
import { contentHash } from "@/lib/auth/password";
import { removeStoredRef } from "@/lib/storage-cleanup";
import {
  attachmentKey,
  b2KeyFromRef,
  isB2Ref,
  putB2,
  signedB2Url,
  storageProvider,
} from "@/lib/storage";

type Ctx = { params: Promise<{ vaultId: string }> };

export function safePath(p: string) {
  if (!p || p.length > 512) return false;
  if (/[\u0000-\u001f\u007f]/.test(p)) return false;
  if (p.includes("..") || p.includes("\\") || p.startsWith("/")) return false;
  return p
    .split("/")
    .every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

const MAX_BYTES = 10 * 1024 * 1024;

function apiUrl(vaultId: string, row: { id: string }) {
  return `/api/v1/vaults/${vaultId}/attachments?id=${row.id}`;
}

function publicUrl(vaultId: string, row: { id: string; blobUrl: string | null }) {
  if (!row.blobUrl || isB2Ref(row.blobUrl)) return apiUrl(vaultId, row);
  return row.blobUrl;
}

function storageOf(blobUrl: string | null) {
  if (!blobUrl) return "postgres";
  return isB2Ref(blobUrl) ? "b2" : "vercel";
}

export async function GET(request: NextRequest, ctx: Ctx) {
  try {
    const { vaultId } = await ctx.params;
    const access = await withVault(request, vaultId);
    if ("response" in access) return access.response;

    if (request.nextUrl.searchParams.get("list") === "1") {
      const rows = await db
        .select({
          id: attachments.id,
          path: attachments.path,
          mime: attachments.mime,
          size: attachments.size,
          blobUrl: attachments.blobUrl,
          createdAt: attachments.createdAt,
        })
        .from(attachments)
        .where(eq(attachments.vaultId, vaultId))
        .orderBy(desc(attachments.createdAt));
      return Response.json({
        attachments: rows.map((row) => ({
          ...row,
          url: publicUrl(vaultId, row),
          storage: storageOf(row.blobUrl),
        })),
      });
    }

    const path = request.nextUrl.searchParams.get("path");
    const id = request.nextUrl.searchParams.get("id");
    if (!path && !id) return Response.json({ error: "Falta path o id" }, { status: 400 });
    if (path && !safePath(path)) return Response.json({ error: "Path inválido" }, { status: 400 });

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

    if (!row) return Response.json({ error: "Adjunto no encontrado" }, { status: 404 });

    if (isB2Ref(row.blobUrl)) {
      const url = await signedB2Url(b2KeyFromRef(row.blobUrl), 3600);
      return Response.redirect(url, 307);
    }
    if (row.blobUrl) {
      return Response.redirect(row.blobUrl, 307);
    }
    if (!row.data) return Response.json({ error: "Adjunto no encontrado" }, { status: 404 });

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
    if (!safePath(path)) {
      return Response.json({ error: "Path inválido" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return Response.json({ error: "El archivo supera 10 MB" }, { status: 413 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const mime = file.type || guessMime(path);
    const sha = contentHash(bytes.toString("base64"));
    const provider = storageProvider();

    const [existing] = await db
      .select({ id: attachments.id, blobUrl: attachments.blobUrl })
      .from(attachments)
      .where(
        and(
          eq(attachments.vaultId, vaultId),
          sql`lower(${attachments.path}) = ${path.toLowerCase()}`,
        ),
      )
      .limit(1);

    let blobUrl: string | null = null;
    let data: string | null = null;

    if (provider === "b2") {
      blobUrl = await putB2(attachmentKey(vaultId, path), bytes, mime);
    } else if (provider === "vercel") {
      const token = process.env.BLOB_READ_WRITE_TOKEN;
      if (!token) throw new Error("BLOB_READ_WRITE_TOKEN no configurado");
      const blob = await put(`vaults/${vaultId}/${path}`, bytes, {
        access: "public",
        addRandomSuffix: true,
        contentType: mime,
        token,
      });
      blobUrl = blob.url;
    } else {
      data = bytes.toString("base64");
    }

    if (existing) {
      await db
        .update(attachments)
        .set({ mime, size: bytes.byteLength, sha256: sha, data, blobUrl })
        .where(eq(attachments.id, existing.id));
      if (existing.blobUrl && existing.blobUrl !== blobUrl) {
        await removeStoredRef(existing.blobUrl);
      }
    } else {
      await db.insert(attachments).values({
        vaultId,
        path,
        mime,
        size: bytes.byteLength,
        sha256: sha,
        data,
        blobUrl,
      });
    }

    return Response.json({
      ok: true,
      path,
      storage: provider,
      url:
        provider === "b2"
          ? `/api/v1/vaults/${vaultId}/attachments?path=${encodeURIComponent(path)}`
          : blobUrl ?? `/api/v1/vaults/${vaultId}/attachments?path=${encodeURIComponent(path)}`,
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
    const path = request.nextUrl.searchParams.get("path");
    if (!id && !path) return Response.json({ error: "Falta id o path" }, { status: 400 });
    if (path && !safePath(path)) return Response.json({ error: "Path inválido" }, { status: 400 });

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
    if (!row) return Response.json({ error: "Adjunto no encontrado" }, { status: 404 });

    await removeStoredRef(row.blobUrl);
    await db.delete(attachments).where(eq(attachments.id, row.id));
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
