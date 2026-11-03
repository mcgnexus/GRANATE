import JSZip from "jszip";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { attachments, bases, canvases, folders, links, notes } from "@/lib/db/schema";
import { createNote, getNoteByPath, syncNoteDerived, updateNote } from "@/lib/notes";
import { parseCanvas, serializeCanvas } from "@/lib/canvas";
import { contentHash } from "@/lib/auth/password";
import { normalizeVaultPath } from "@/lib/utils";

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 3000;

export type ImportReport = {
  notes: number;
  attachments: number;
  canvases: number;
  bases: number;
  skipped: number;
  unresolvedLinks: number;
};

function isIgnored(path: string) {
  const lower = path.toLowerCase();
  return (
    lower.startsWith(".obsidian/") ||
    lower.startsWith(".git/") ||
    lower.startsWith("__macosx/") ||
    lower.endsWith(".ds_store")
  );
}

export async function importVaultZip(
  vaultId: string,
  userId: string,
  buffer: ArrayBuffer | Uint8Array,
): Promise<ImportReport> {
  const zip = await JSZip.loadAsync(buffer);
  const entries = Object.values(zip.files).filter((entry) => !entry.dir);
  if (entries.length > MAX_FILES) {
    throw new Error(`La bóveda tiene demasiados archivos (${entries.length}). Máximo ${MAX_FILES}.`);
  }

  const report: ImportReport = {
    notes: 0,
    attachments: 0,
    canvases: 0,
    bases: 0,
    skipped: 0,
    unresolvedLinks: 0,
  };

  const markdownEntries = entries.filter(
    (entry) => !isIgnored(entry.name) && entry.name.toLowerCase().endsWith(".md"),
  );

  for (const entry of Object.values(zip.files)) {
    if (!entry.dir || isIgnored(entry.name)) continue;
    const folderPath = normalizeVaultPath(entry.name);
    if (!folderPath) continue;
    await db
      .insert(folders)
      .values({ vaultId, path: folderPath })
      .onConflictDoNothing();
  }

  for (const entry of markdownEntries) {
    const path = normalizeVaultPath(entry.name);
    const content = await entry.async("string");
    const existing = await getNoteByPath(vaultId, path);
    if (existing) {
      await updateNote({ vaultId, noteId: existing.id, userId, content, source: "import" });
    } else {
      await createNote({ vaultId, userId, path, content, source: "import", skipDerived: true });
    }
    report.notes++;
  }

  for (const entry of entries) {
    if (isIgnored(entry.name)) {
      report.skipped++;
      continue;
    }
    const path = normalizeVaultPath(entry.name);
    const lower = path.toLowerCase();

    if (lower.endsWith(".md")) continue;

    if (lower.endsWith(".canvas")) {
      const raw = await entry.async("string");
      const data = parseCanvas(raw);
      const json = JSON.parse(serializeCanvas(data));
      const existingCanvas = await db
        .select({ id: canvases.id })
        .from(canvases)
        .where(and(eq(canvases.vaultId, vaultId), sql`lower(${canvases.path}) = ${lower}`))
        .limit(1);
      if (existingCanvas[0]) {
        await db
          .update(canvases)
          .set({ data: json, contentHash: contentHash(raw), updatedAt: new Date() })
          .where(eq(canvases.id, existingCanvas[0].id));
      } else {
        await db
          .insert(canvases)
          .values({ vaultId, path, data: json, contentHash: contentHash(raw) });
      }
      report.canvases++;
      continue;
    }

    if (lower.endsWith(".base")) {
      const raw = await entry.async("string");
      await upsertBase(vaultId, path, raw);
      report.bases++;
      continue;
    }

    const blob = await entry.async("uint8array");
    if (blob.byteLength > MAX_ATTACHMENT_BYTES) {
      report.skipped++;
      continue;
    }

    await db
      .insert(attachments)
      .values({
        vaultId,
        path,
        mime: guessMime(path),
        size: blob.byteLength,
        sha256: contentHash(Buffer.from(blob).toString("base64")),
        data: Buffer.from(blob).toString("base64"),
      })
      .onConflictDoNothing();
    report.attachments++;
  }

  // Second pass: resolve links now that all notes exist.
  const all = await db
    .select({ id: notes.id })
    .from(notes)
    .where(and(eq(notes.vaultId, vaultId), isNull(notes.deletedAt)));

  for (const note of all) await syncNoteDerived(note.id);

  const unresolved = await db
    .select({ id: links.id })
    .from(links)
    .where(and(eq(links.vaultId, vaultId), eq(links.resolved, false)));

  report.unresolvedLinks = unresolved.length;
  return report;
}

async function upsertBase(vaultId: string, path: string, raw: string) {
  const lower = path.toLowerCase();
  const existing = await db
    .select({ id: bases.id })
    .from(bases)
    .where(and(eq(bases.vaultId, vaultId), sql`lower(${bases.path}) = ${lower}`))
    .limit(1);

  if (existing[0]) {
    await db.update(bases).set({ raw, updatedAt: new Date() }).where(eq(bases.id, existing[0].id));
  } else {
    await db.insert(bases).values({ vaultId, path, raw });
  }
}

export function guessMime(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    pdf: "application/pdf",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    mp4: "video/mp4",
    webm: "video/webm",
    zip: "application/zip",
    json: "application/json",
    txt: "text/plain",
  };
  return map[ext] ?? "application/octet-stream";
}
