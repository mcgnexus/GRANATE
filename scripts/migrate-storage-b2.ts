import { config as loadEnv } from "dotenv";
import { createHash } from "node:crypto";

loadEnv({ path: ".env.local" });

function sha256(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function main() {
  const { db } = await import("../src/lib/db");
  const { attachments, backups } = await import("../src/lib/db/schema");
  const { eq } = await import("drizzle-orm");
  const {
    attachmentKey,
    b2KeyFromRef,
    isB2Ref,
    putB2,
    signedB2Url,
  } = await import("../src/lib/storage");

  async function verify(url: string, expectedSize: number, expectedHash: string) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`No se pudo verificar (${response.status})`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength !== expectedSize) throw new Error("Tamaño distinto tras subir");
    if (sha256(bytes) !== expectedHash) throw new Error("Hash distinto tras subir");
  }

  const rows = await db
    .select({
      id: attachments.id,
      vaultId: attachments.vaultId,
      path: attachments.path,
      mime: attachments.mime,
      size: attachments.size,
      blobUrl: attachments.blobUrl,
    })
    .from(attachments);
  let migratedAttachments = 0;
  for (const row of rows) {
    if (isB2Ref(row.blobUrl)) continue;
    const [full] = await db
      .select({ data: attachments.data })
      .from(attachments)
      .where(eq(attachments.id, row.id))
      .limit(1);
    if (!full?.data) continue;
    const bytes = Buffer.from(full.data, "base64");
    const ref = await putB2(attachmentKey(row.vaultId, row.path), bytes, row.mime);
    await verify(await signedB2Url(b2KeyFromRef(ref), 300), bytes.byteLength, sha256(bytes));
    await db
      .update(attachments)
      .set({ blobUrl: ref, data: null })
      .where(eq(attachments.id, row.id));
    migratedAttachments++;
    console.log(`✔ adjunto ${row.path}`);
  }

  const backupRows = await db
    .select({
      id: backups.id,
      vaultId: backups.vaultId,
      path: backups.path,
      blobUrl: backups.blobUrl,
    })
    .from(backups);
  let migratedBackups = 0;
  for (const row of backupRows) {
    if (isB2Ref(row.blobUrl)) continue;
    const [full] = await db
      .select({ data: backups.data })
      .from(backups)
      .where(eq(backups.id, row.id))
      .limit(1);
    if (!full?.data) continue;
    const bytes = Buffer.from(full.data, "base64");
    const key = row.path.startsWith("backups/")
      ? row.path
      : `backups/${row.vaultId}/${row.path.split("/").pop()}`;
    const ref = await putB2(key, bytes, "application/zip");
    await verify(await signedB2Url(b2KeyFromRef(ref), 300), bytes.byteLength, sha256(bytes));
    await db
      .update(backups)
      .set({ blobUrl: ref, data: null })
      .where(eq(backups.id, row.id));
    migratedBackups++;
    console.log(`✔ backup ${row.path}`);
  }

  console.log(`Migrados: ${migratedAttachments} adjuntos, ${migratedBackups} backups`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
