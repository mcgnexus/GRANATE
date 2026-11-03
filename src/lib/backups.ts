import { and, count, desc, eq, isNull, lt } from "drizzle-orm";
import { put } from "@vercel/blob";
import { db } from "@/lib/db";
import { backups, notes } from "@/lib/db/schema";
import { exportVaultZip } from "@/lib/exporter";
import { ApiError } from "@/lib/api-error";
import { slugify } from "@/lib/utils";
import { removeStoredRef } from "@/lib/storage-cleanup";
import {
  backupKey,
  putB2,
  storageProvider,
} from "@/lib/storage";

export function hasExternalStorage() {
  return storageProvider() !== "postgres";
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
  const filename = `${slugify(options.vaultName) || "boveda"}-${stamp}.zip`;
  const path = `backups/${options.vaultId}/${filename}`;
  const provider = storageProvider();
  let blobUrl = "";
  let data: string | null = null;

  if (provider === "b2") {
    blobUrl = await putB2(
      backupKey(options.vaultId, filename),
      Buffer.from(bytes),
      "application/zip",
    );
  } else if (provider === "vercel") {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) throw new ApiError("BLOB_READ_WRITE_TOKEN no configurado", 400);
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
        "El ZIP supera 25 MB y no hay almacenamiento externo configurado. Exporta el ZIP manualmente.",
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

  if (provider === "postgres") {
    blobUrl = `/api/v1/vaults/${options.vaultId}/backups/download?id=${row.id}`;
    await db.update(backups).set({ blobUrl }).where(eq(backups.id, row.id));
  }

  const safe = { ...row } as Record<string, unknown>;
  delete safe.data;
  return { ...safe, blobUrl };
}

export async function pruneBackups(vaultId: string, keep = 7) {
  const rows = await listBackups(vaultId);
  const stale = rows.slice(keep);
  for (const row of stale) {
    await removeStoredRef(row.blobUrl);
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
  await removeStoredRef(row.blobUrl);
  await db.delete(backups).where(eq(backups.id, id));
}

/** Used by the cron endpoint to avoid unbounded history. */
export async function pruneOlderThan(days: number) {
  const threshold = new Date(Date.now() - days * 86_400_000);
  const stale = await db
    .select()
    .from(backups)
    .where(lt(backups.createdAt, threshold));
  for (const row of stale) {
    await removeStoredRef(row.blobUrl);
    await db.delete(backups).where(eq(backups.id, row.id));
  }
  return stale.length;
}
