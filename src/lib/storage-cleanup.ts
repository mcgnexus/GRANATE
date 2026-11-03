import { eq } from "drizzle-orm";
import { del } from "@vercel/blob";
import { db } from "@/lib/db";
import { attachments, backups } from "@/lib/db/schema";
import { b2KeyFromRef, deleteB2, isB2Ref } from "@/lib/storage";

/** Removes a stored object from B2 (or Vercel Blob) without failing the delete operation. */
export async function removeStoredRef(ref: string | null | undefined) {
  if (!ref) return;
  if (isB2Ref(ref)) {
    await deleteB2(b2KeyFromRef(ref)).catch(() => undefined);
    return;
  }
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (token && /^https?:\/\//.test(ref)) {
    await del(ref, { token }).catch(() => undefined);
  }
}

/** Deletes every attachment and backup object of a vault before its DB rows cascade. */
export async function deleteVaultStorage(vaultId: string) {
  const [attachmentRows, backupRows] = await Promise.all([
    db
      .select({ blobUrl: attachments.blobUrl })
      .from(attachments)
      .where(eq(attachments.vaultId, vaultId)),
    db
      .select({ blobUrl: backups.blobUrl })
      .from(backups)
      .where(eq(backups.vaultId, vaultId)),
  ]);

  for (const row of [...attachmentRows, ...backupRows]) {
    await removeStoredRef(row.blobUrl);
  }
}
