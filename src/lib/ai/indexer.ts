import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { chunks, notes } from "@/lib/db/schema";
import { chunkNote } from "@/lib/markdown/chunk";
import { stripMarkdownForEmbedding } from "@/lib/markdown/frontmatter";
import { config } from "@/lib/config";
import { embedDocuments } from "./embeddings";

/**
 * Rebuilds the vector index for one note. Safe to call after every save:
 * missing API keys simply skip the work.
 */
export async function indexNote(noteId: string): Promise<{ indexed: number; skipped: boolean }> {
  if (!config.hasEmbeddings) return { indexed: 0, skipped: true };

  const [note] = await db
    .select({ id: notes.id, vaultId: notes.vaultId, content: notes.content })
    .from(notes)
    .where(and(eq(notes.id, noteId), isNull(notes.deletedAt)))
    .limit(1);

  if (!note) return { indexed: 0, skipped: true };

  const plain = stripMarkdownForEmbedding(note.content);
  const parts = chunkNote(plain);
  if (parts.length === 0) {
    await db.delete(chunks).where(eq(chunks.noteId, noteId));
    return { indexed: 0, skipped: false };
  }

  const BATCH = 16;
  const vectors: number[][] = [];
  for (let i = 0; i < parts.length; i += BATCH) {
    const batch = parts.slice(i, i + BATCH).map((part) => `${part.heading ?? ""}\n${part.content}`);
    vectors.push(...(await embedDocuments(batch)));
  }

  await db.delete(chunks).where(eq(chunks.noteId, noteId));

  const valid = parts
    .map((part, index) => ({ part, vector: vectors[index] }))
    .filter((item) => item.vector && item.vector.length > 0);

  if (valid.length) {
    await db.insert(chunks).values(
      valid.map(({ part, vector }) => ({
        noteId,
        vaultId: note.vaultId,
        idx: part.idx,
        heading: part.heading,
        content: part.content,
        tokens: part.tokens,
        embedding: vector,
      })),
    );
  }

  return { indexed: valid.length, skipped: false };
}

export async function deleteNoteIndex(noteId: string) {
  await db.delete(chunks).where(eq(chunks.noteId, noteId));
}
