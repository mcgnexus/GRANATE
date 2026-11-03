import JSZip from "jszip";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { attachments, bases, canvases, folders, notes } from "@/lib/db/schema";

export async function exportVaultZip(vaultId: string): Promise<Uint8Array> {
  const [noteRows, attachmentRows, canvasRows, baseRows, folderRows] = await Promise.all([
    db
      .select()
      .from(notes)
      .where(and(eq(notes.vaultId, vaultId), isNull(notes.deletedAt))),
    db.select().from(attachments).where(eq(attachments.vaultId, vaultId)),
    db.select().from(canvases).where(eq(canvases.vaultId, vaultId)),
    db.select().from(bases).where(eq(bases.vaultId, vaultId)),
    db.select().from(folders).where(eq(folders.vaultId, vaultId)),
  ]);

  const zip = new JSZip();

  for (const folder of folderRows) {
    if (folder.path) zip.folder(folder.path);
  }

  for (const note of noteRows) {
    zip.file(note.path, note.content);
  }

  for (const canvas of canvasRows) {
    zip.file(canvas.path, JSON.stringify(canvas.data, null, 2));
  }

  for (const base of baseRows) {
    zip.file(base.path, base.raw);
  }

  for (const attachment of attachmentRows) {
    if (!attachment.data) continue;
    zip.file(attachment.path, Buffer.from(attachment.data, "base64"));
  }

  zip.file(
    ".granate/manifest.json",
    JSON.stringify(
      {
        app: "GRANATE",
        exportedAt: new Date().toISOString(),
        vaultId,
        notes: noteRows.length,
        attachments: attachmentRows.length,
        canvases: canvasRows.length,
        bases: baseRows.length,
      },
      null,
      2,
    ),
  );

  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
