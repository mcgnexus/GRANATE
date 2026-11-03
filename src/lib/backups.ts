import { and, count, desc, eq, isNull, lt } from "drizzle-orm";
import { del, put } from "@vercel/blob";
import { db } from "@/lib/db";
import { backups, notes } from "@/lib/db/schema";
import { exportVaultZip } from "@/lib/exporter";
import { ApiError } from "@/lib/auth/api";
import { slugify } from "@/lib/utils";

export function hasBlobStorage() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export async function listBackups(vaultId: string) {
  return db
    .select({
      id: backups.id,
      vaultId: backups.vaultId,
      path: backups.path,
      blobUrl: backups.blobUrl,
      size: backups.size,
      noteCount: backups.noteCount,
      kind: backups.kind,
      createdAt: backups.createdAt,
    })
    .from(backups)
    .where(eq(backups.vaultId, vaultId))
    .orderBy(desc(backups.createdAt));
}

export async function createBackup(options: {
  vaultId: string;
  vaultName: string;
  kind?: "manual" | "cron";
}) {
  const bytes = await exportVaultZip(options.vaultId);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = `backups/${options.vaultId}/${slugify(options.vaultName) || "boveda"}-${stamp}.zip`;
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  let blobUrl = "";
  let data: string | null = null;

  if (token) {
    const blob = await put(path, Buffer.from(bytes), {
      access: "public",
      addRandomSuffix: true,
      contentType: "application/zip",
      token,
    });
    blobUrl = blob.url;
  } else {
    if (bytes.byteLength > 25 * 1024 * 1024) {
      throw new ApiError(
        "El ZIP supera 25 MB y Vercel Blob no está configurado. Exporta el ZIP manualmente.",
        413,
      );
    }
    data = Buffer.from(bytes).toString("base64");
  }

  const [countRow] = await db
    .select({ value: count() })
    .from(notes)
    .where(and(eq(notes.vaultId, options.vaultId), isNull(notes.deletedAt)));

  const [row] = await db
    .insert(backups)
    .values({
      vaultId: options.vaultId,
      path,
      blobUrl,
      data,
      size: bytes.byteLength,
      noteCount: Number(countRow?.value ?? 0),
      kind: options.kind ?? "manual",
    })
    .returning();

  if (!token) {
    blobUrl = `/api/v1/vaults/${options.vaultId}/backups/download?id=${row.id}`;
    await db.update(backups).set({ blobUrl }).where(eq(backups.id, row.id));
  }

  const safe = { ...row } as Record<string, unknown>;
  delete safe.data;
  return { ...safe, blobUrl };
}

export async function pruneBackups(vaultId: string, keep = 7) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  const rows = await listBackups(vaultId);
  const stale = rows.slice(keep);
  for (const row of stale) {
    if (token) await del(row.blobUrl, { token }).catch(() => undefined);
    await db.delete(backups).where(eq(backups.id, row.id));
  }
  return stale.length;
}

export async function deleteBackup(vaultId: string, id: string) {
  const [row] = await db
    .select()
    .from(backups)
    .where(and(eq(backups.vaultId, vaultId), eq(backups.id, id)))
    .limit(1);
  if (!row) throw new ApiError("Backup no encontrado", 404);
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (token) await del(row.blobUrl, { token }).catch(() => undefined);
  await db.delete(backups).where(eq(backups.id, id));
}

/** Used by the cron endpoint to avoid unbounded history. */
export async function pruneOlderThan(days: number) {
  const threshold = new Date(Date.now() - days * 86_400_000);
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  const stale = await db
    .select()
    .from(backups)
    .where(lt(backups.createdAt, threshold));
  for (const row of stale) {
    if (token) await del(row.blobUrl, { token }).catch(() => undefined);
    await db.delete(backups).where(eq(backups.id, row.id));
  }
  return stale.length;
}
