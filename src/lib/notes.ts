import { and, asc, desc, eq, inArray, isNull, notExists, or, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { db } from "@/lib/db";
import {
  folders,
  links,
  noteOpens,
  noteTags,
  notes,
  noteVersions,
  tags,
  type Note,
} from "@/lib/db/schema";
import { contentHash } from "@/lib/auth/password";
import { ApiError } from "@/lib/api-error";
import { countWords, normalizeVaultPath, titleFromPath } from "@/lib/utils";
import {
  collectTags,
  getFrontmatterTags,
  normalizeTag,
  parseFrontmatter,
  serializeFrontmatter,
  type Frontmatter,
} from "@/lib/markdown/frontmatter";
import { buildAliasMap, parseLinks, resolveLink } from "@/lib/markdown/links";

export type NoteSummary = {
  id: string;
  path: string;
  title: string;
  updatedAt: Date;
  wordCount: number;
  pinnedAt?: Date | null;
};

export type NoteDetail = Note & {
  backlinks: Array<{ id: string; path: string; title: string }>;
  outgoing: Array<{ targetPath: string | null; targetId: string | null; rawTarget: string }>;
  tags: string[];
  outline: Array<{ level: number; text: string; line: number }>;
  unlinkedMentions: Array<{ id: string; path: string; title: string; snippet: string }>;
};

export async function listNotes(vaultId: string, includeDeleted = false): Promise<NoteSummary[]> {
  const where = includeDeleted
    ? eq(notes.vaultId, vaultId)
    : and(eq(notes.vaultId, vaultId), isNull(notes.deletedAt));

  const rows = await db
    .select({
      id: notes.id,
      path: notes.path,
      title: notes.title,
      updatedAt: notes.updatedAt,
      wordCount: notes.wordCount,
      pinnedAt: notes.pinnedAt,
    })
    .from(notes)
    .where(where)
    .orderBy(asc(notes.path));

  return rows;
}

export async function listFolders(vaultId: string) {
  const rows = await db
    .select({ id: folders.id, path: folders.path })
    .from(folders)
    .where(eq(folders.vaultId, vaultId))
    .orderBy(asc(folders.path));
  return rows;
}

export async function getNote(vaultId: string, id: string): Promise<NoteDetail | null> {
  const rows = await db
    .select()
    .from(notes)
    .where(and(eq(notes.vaultId, vaultId), eq(notes.id, id), isNull(notes.deletedAt)))
    .limit(1);
  const note = rows[0];
  if (!note) return null;

  const [backlinks, outgoing, tagRows, parsed] = await Promise.all([
    db
      .select({ id: notes.id, path: notes.path, title: notes.title })
      .from(links)
      .innerJoin(notes, eq(links.sourceNoteId, notes.id))
      .where(and(eq(links.targetNoteId, id), isNull(notes.deletedAt)))
      .orderBy(asc(notes.path)),
    db
      .select({
        targetPath: links.targetPath,
        targetId: links.targetNoteId,
        rawTarget: links.rawTarget,
      })
      .from(links)
      .where(eq(links.sourceNoteId, id)),
    db
      .select({ name: tags.name })
      .from(noteTags)
      .innerJoin(tags, eq(noteTags.tagId, tags.id))
      .where(eq(noteTags.noteId, id))
      .orderBy(asc(tags.name)),
    Promise.resolve(parseFrontmatter(note.content)),
  ]);

  const { extractOutline } = await import("@/lib/markdown/frontmatter");

  const unlinkedMentions = await listUnlinkedMentions(vaultId, id, note.title);

  return {
    ...note,
    backlinks,
    outgoing,
    tags: tagRows.map((row) => row.name),
    outline: extractOutline(parsed.body),
    unlinkedMentions,
  };
}

export async function listUnlinkedMentions(
  vaultId: string,
  noteId: string,
  title: string,
): Promise<Array<{ id: string; path: string; title: string; snippet: string }>> {
  const needle = title.trim().toLowerCase();
  if (!needle) return [];

  const linkedIds = new Set(
    (
      await db
        .select({ id: links.sourceNoteId })
        .from(links)
        .where(and(eq(links.targetNoteId, noteId)))
    ).map((row) => row.id),
  );

  const candidates = await db
    .select({ id: notes.id, path: notes.path, title: notes.title, content: notes.content })
    .from(notes)
    .where(and(eq(notes.vaultId, vaultId), isNull(notes.deletedAt)));

  const result: Array<{ id: string; path: string; title: string; snippet: string }> = [];
  for (const candidate of candidates) {
    if (candidate.id === noteId) continue;
    if (linkedIds.has(candidate.id)) continue;
    const lower = candidate.content.toLowerCase();
    const index = lower.indexOf(needle);
    if (index === -1) continue;
    const start = Math.max(0, index - 40);
    const end = Math.min(candidate.content.length, index + needle.length + 40);
    const snippet = candidate.content.slice(start, end).replace(/\s+/g, " ").trim();
    result.push({ id: candidate.id, path: candidate.path, title: candidate.title, snippet });
    if (result.length >= 20) break;
  }
  return result;
}

export async function getNoteByPath(vaultId: string, path: string): Promise<Note | null> {
  const rows = await db
    .select()
    .from(notes)
    .where(
      and(
        eq(notes.vaultId, vaultId),
        sql`lower(${notes.path}) = ${normalizeVaultPath(path).toLowerCase()}`,
        isNull(notes.deletedAt),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function ensureFolderHierarchy(vaultId: string, folderPath: string) {
  const parts = folderPath.split("/").filter(Boolean);
  for (let i = 1; i <= parts.length; i++) {
    await db
      .insert(folders)
      .values({ vaultId, path: parts.slice(0, i).join("/") })
      .onConflictDoNothing();
  }
}

export async function ensureFolders(vaultId: string, path: string) {
  const parts = path.split("/").slice(0, -1);
  if (parts.length) await ensureFolderHierarchy(vaultId, parts.join("/"));
}

export type CreateNoteInput = {
  vaultId: string;
  userId: string;
  path: string;
  content?: string;
  source?: "save" | "import" | "llm" | "restore" | "api";
  /** Import can skip per-note link resolution and run one pass at the end. */
  skipDerived?: boolean;
};

export async function createNote(input: CreateNoteInput): Promise<Note> {
  const path = normalizeVaultPath(input.path);
  if (!path) throw new Error("La nota necesita una ruta");
  const finalPath = path.endsWith(".md") ? path : `${path}.md`;
  const content = input.content ?? "";
  const parsed = parseFrontmatter(content);

  await ensureFolders(input.vaultId, finalPath);

  const [note] = await db
    .insert(notes)
    .values({
      vaultId: input.vaultId,
      path: finalPath,
      title: titleFromPath(finalPath),
      content,
      frontmatter: parsed.frontmatter,
      contentHash: contentHash(content),
      wordCount: countWords(content),
      createdBy: input.userId,
      updatedBy: input.userId,
      mtime: new Date(),
    })
    .returning();

  if (content) {
    await db.insert(noteVersions).values({
      noteId: note.id,
      content,
      frontmatter: parsed.frontmatter,
      contentHash: note.contentHash,
      source: input.source ?? "save",
      createdBy: input.userId,
    });
  }

  if (!input.skipDerived) {
    await syncNoteDerived(note.id);
  }
  return note;
}


/** Prepara las escrituras de enlaces y etiquetas de una nota para ejecutarse en batch. */
async function planNoteDerivedStatements(
  noteId: string,
): Promise<BatchItem<"pg">[]> {
  const statements: BatchItem<"pg">[] = [];
  const [note] = await db.select().from(notes).where(eq(notes.id, noteId)).limit(1);
  if (!note) return statements;

  const parsed = parseFrontmatter(note.content);
  const all = await db
    .select({ id: notes.id, path: notes.path, frontmatter: notes.frontmatter })
    .from(notes)
    .where(and(eq(notes.vaultId, note.vaultId), isNull(notes.deletedAt)));
  const resolvable = buildAliasMap(all);
  const parsedLinks = parseLinks(parsed.body);

  statements.push(db.delete(links).where(eq(links.sourceNoteId, noteId)));

  const rows = parsedLinks.map((link) => {
    const target = resolveLink(link.target, note.path, resolvable);
    return {
      vaultId: note.vaultId,
      sourceNoteId: noteId,
      rawTarget: link.rawTarget,
      targetPath: target?.path ?? link.target,
      targetNoteId: target?.id ?? null,
      kind: link.kind,
      heading: link.heading,
      alias: link.alias,
      resolved: Boolean(target),
    };
  });
  if (rows.length) {
    for (let i = 0; i < rows.length; i += 200) {
      statements.push(db.insert(links).values(rows.slice(i, i + 200)));
    }
  }

  statements.push(db.delete(noteTags).where(eq(noteTags.noteId, noteId)));

  const noteTagNames = collectTags(parsed.frontmatter, parsed.body);
  for (const name of noteTagNames) {
    // Upsert de la etiqueta + asociación por subconsulta: dentro del batch,
    // la subconsulta ve la etiqueta creada por este mismo lote o por otro ya
    // confirmado, así no hay carrera con el índice único.
    statements.push(
      db.insert(tags).values({ vaultId: note.vaultId, name }).onConflictDoNothing(),
    );
    statements.push(
      db
        .insert(noteTags)
        .values({
          noteId,
          tagId: sql`(select ${tags.id} from ${tags} where ${tags.vaultId} = ${note.vaultId} and lower(${tags.name}) = ${name.toLowerCase()})`,
        })
        .onConflictDoNothing(),
    );
  }
  return statements;
}

export type UpdateNoteInput = {
  vaultId: string;
  noteId: string;
  userId: string;
  content?: string;
  path?: string;
  frontmatter?: Frontmatter;
  source?: "save" | "import" | "llm" | "restore" | "api";
  /** Import can skip per-note link resolution and run one pass at the end. */
  skipDerived?: boolean;
};

export async function updateNote(input: UpdateNoteInput): Promise<Note> {
  const rows = await db
    .select()
    .from(notes)
    .where(and(eq(notes.vaultId, input.vaultId), eq(notes.id, input.noteId)))
    .limit(1);
  const existing = rows[0];
  if (!existing) throw new Error("Nota no encontrada");

  // Un cambio que solo trae ruta no debe reescribir el contenido: evita pisar
  // un guardado concurrente con una lectura anterior del documento.
  const contentChanged = input.content !== undefined || input.frontmatter !== undefined;
  let content = input.content ?? existing.content;
  if (input.frontmatter) {
    const parsed = parseFrontmatter(content);
    content = serializeFrontmatter(input.frontmatter, parsed.body);
  }

  const parsed = parseFrontmatter(content);
  const nextPath = input.path ? normalizeVaultPath(input.path) : existing.path;
  const finalPath = nextPath.endsWith(".md") ? nextPath : `${nextPath}.md`;
  const pathChanged = finalPath.toLowerCase() !== existing.path.toLowerCase();

  // Atomicidad total: nota, versión, carpetas, reescritura de enlaces y
  // derivados se envían en un único batch, que el driver de Neon ejecuta
  // dentro de una transacción HTTP (todo o nada).
  const statements: BatchItem<"pg">[] = [];
  statements.push(
    db
      .update(notes)
      .set({
        path: finalPath,
        title: titleFromPath(finalPath),
        ...(contentChanged
          ? {
              content,
              frontmatter: input.frontmatter ?? parsed.frontmatter,
              contentHash: contentHash(content),
              wordCount: countWords(content),
            }
          : {}),
        updatedBy: input.userId,
        updatedAt: new Date(),
        mtime: new Date(),
      })
      .where(eq(notes.id, existing.id)),
  );

  if (contentChanged) {
    statements.push(
      db.insert(noteVersions).values({
        noteId: existing.id,
        content,
        frontmatter: input.frontmatter ?? parsed.frontmatter,
        contentHash: contentHash(content),
        source: input.source ?? "save",
        createdBy: input.userId,
      }),
    );
  }

  if (pathChanged) {
    const parts = finalPath.split("/").slice(0, -1);
    for (let i = 1; i <= parts.length; i++) {
      statements.push(
        db
          .insert(folders)
          .values({ vaultId: input.vaultId, path: parts.slice(0, i).join("/") })
          .onConflictDoNothing(),
      );
    }

    const all = await db
      .select({
        id: notes.id,
        path: notes.path,
        content: notes.content,
        frontmatter: notes.frontmatter,
      })
      .from(notes)
      .where(and(eq(notes.vaultId, input.vaultId), isNull(notes.deletedAt)));
    const resolvable = buildAliasMap(all);
    resolvable.push({ id: existing.id, path: existing.path, aliases: [] });
    const { rewriteLinks } = await import("@/lib/markdown/links");

    for (const note of all) {
      const nextContent = rewriteLinks(note.content, existing.path, finalPath, resolvable);
      if (nextContent === note.content) continue;
      statements.push(
        db
          .update(notes)
          .set({
            content: nextContent,
            contentHash: contentHash(nextContent),
            updatedAt: new Date(),
          })
          .where(eq(notes.id, note.id)),
      );
      statements.push(...(await planNoteDerivedStatements(note.id)));
    }
  }

  if (contentChanged && !input.skipDerived) {
    statements.push(...(await planNoteDerivedStatements(existing.id)));
  }

  await db.batch(statements as [BatchItem<"pg">, ...BatchItem<"pg">[]]);
  const [updated] = await db.select().from(notes).where(eq(notes.id, existing.id)).limit(1);
  return updated;
}

/** Renames a folder (and its subfolders) moving every note and rewriting links once. */
export async function renameFolder(input: {
  vaultId: string;
  userId: string;
  from: string;
  to: string;
}) {
  const from = normalizeVaultPath(input.from);
  const to = normalizeVaultPath(input.to);
  if (!from || !to) throw new Error("La carpeta necesita un nombre");
  if (from.toLowerCase() === to.toLowerCase()) return { movedNotes: 0, movedFolders: 0 };
  if (to.toLowerCase().startsWith(`${from.toLowerCase()}/`)) {
    throw new Error("No puedes mover una carpeta dentro de sí misma");
  }

  const allFolders = await db
    .select({ id: folders.id, path: folders.path })
    .from(folders)
    .where(eq(folders.vaultId, input.vaultId));

  const fromLower = from.toLowerCase();
  const affected = allFolders.filter(
    (folder) =>
      folder.path.toLowerCase() === fromLower ||
      folder.path.toLowerCase().startsWith(`${fromLower}/`),
  );
  if (!affected.length) throw new Error("Carpeta no encontrada");

  const affectedIds = new Set(affected.map((folder) => folder.id));
  const targetFolders = affected.map((folder) => ({
    from: folder.path,
    to: `${to}${folder.path.slice(from.length)}`,
  }));
  const targetFolderNames = new Set(targetFolders.map((folder) => folder.to.toLowerCase()));
  const folderClash = allFolders.some(
    (folder) =>
      !affectedIds.has(folder.id) && targetFolderNames.has(folder.path.toLowerCase()),
  );
  if (folderClash) throw new Error("Ya existe una carpeta en la ruta de destino");

  const allNotes = await db
    .select({ id: notes.id, path: notes.path })
    .from(notes)
    .where(and(eq(notes.vaultId, input.vaultId), isNull(notes.deletedAt)));

  const moving = allNotes.filter((note) =>
    note.path.toLowerCase().startsWith(`${fromLower}/`),
  );
  const movingIds = new Set(moving.map((note) => note.id));
  const moves = moving.map((note) => ({
    id: note.id,
    oldPath: note.path,
    newPath: `${to}${note.path.slice(from.length)}`,
  }));
  const targetNoteNames = new Set(moves.map((move) => move.newPath.toLowerCase()));
  const noteClash = allNotes.some(
    (note) => !movingIds.has(note.id) && targetNoteNames.has(note.path.toLowerCase()),
  );
  if (noteClash) throw new Error("Ya existe una nota en la ruta de destino");

  if (affected.length) {
    await db.delete(folders).where(inArray(folders.id, Array.from(affectedIds)));
  }
  for (const folder of targetFolders) {
    await ensureFolderHierarchy(input.vaultId, folder.to);
  }

  for (const move of moves) {
    await db
      .update(notes)
      .set({
        path: move.newPath,
        title: titleFromPath(move.newPath),
        updatedAt: new Date(),
        mtime: new Date(),
        updatedBy: input.userId,
      })
      .where(eq(notes.id, move.id));
  }

  if (moves.length) {
    const all = await db
      .select({
        id: notes.id,
        path: notes.path,
        content: notes.content,
        frontmatter: notes.frontmatter,
      })
      .from(notes)
      .where(and(eq(notes.vaultId, input.vaultId), isNull(notes.deletedAt)));

    const resolvable = buildAliasMap(all);
    for (const move of moves) {
      resolvable.push({ id: move.id, path: move.oldPath, aliases: [] });
    }
    const { rewriteLinks } = await import("@/lib/markdown/links");
    const touched = new Set(moves.map((move) => move.id));

    for (const note of all) {
      let nextContent = note.content;
      for (const move of moves) {
        nextContent = rewriteLinks(nextContent, move.oldPath, move.newPath, resolvable);
      }
      if (nextContent === note.content) continue;
      await db
        .update(notes)
        .set({
          content: nextContent,
          contentHash: contentHash(nextContent),
          updatedAt: new Date(),
        })
        .where(eq(notes.id, note.id));
      touched.add(note.id);
    }

    for (const noteId of touched) {
      await syncNoteDerived(noteId);
    }
  }

  return { movedNotes: moves.length, movedFolders: affected.length };
}

/** Deletes an empty folder. Refuses if it still has notes or subfolders. */
export async function deleteFolder(vaultId: string, folderPath: string) {
  const path = normalizeVaultPath(folderPath);
  if (!path) throw new Error("La carpeta necesita un nombre");
  const prefix = `${path.toLowerCase()}/`;

  const noteCount = await db
    .select({ id: notes.id })
    .from(notes)
    .where(
      and(
        eq(notes.vaultId, vaultId),
        isNull(notes.deletedAt),
        sql`lower(${notes.path}) like ${`${prefix}%`}`,
      ),
    )
    .limit(1);
  if (noteCount[0]) {
    throw new Error("La carpeta no está vacía. Mueve o borra sus notas primero.");
  }

  const subfolder = await db
    .select({ id: folders.id })
    .from(folders)
    .where(
      and(
        eq(folders.vaultId, vaultId),
        sql`lower(${folders.path}) like ${`${prefix}%`}`,
      ),
    )
    .limit(1);
  if (subfolder[0]) {
    throw new Error("La carpeta contiene subcarpetas. Elimínalas primero.");
  }

  await db
    .delete(folders)
    .where(
      and(
        eq(folders.vaultId, vaultId),
        sql`lower(${folders.path}) = ${path.toLowerCase()}`,
      ),
    );
}

export async function deleteNote(vaultId: string, noteId: string) {
  await db
    .update(notes)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(notes.vaultId, vaultId), eq(notes.id, noteId)));
}

export async function restoreNote(vaultId: string, noteId: string) {
  await db
    .update(notes)
    .set({ deletedAt: null, updatedAt: new Date() })
    .where(and(eq(notes.vaultId, vaultId), eq(notes.id, noteId)));
}

export async function getTrash(vaultId: string) {
  return db
    .select({ id: notes.id, path: notes.path, deletedAt: notes.deletedAt })
    .from(notes)
    .where(and(eq(notes.vaultId, vaultId), sql`${notes.deletedAt} is not null`))
    .orderBy(desc(notes.deletedAt));
}

export async function getVersions(vaultId: string, noteId: string) {
  await assertNoteInVault(vaultId, noteId);
  return db
    .select({
      id: noteVersions.id,
      source: noteVersions.source,
      createdAt: noteVersions.createdAt,
      contentHash: noteVersions.contentHash,
    })
    .from(noteVersions)
    .where(eq(noteVersions.noteId, noteId))
    .orderBy(desc(noteVersions.createdAt))
    .limit(50);
}

export async function getVersion(vaultId: string, noteId: string, versionId: string) {
  await assertNoteInVault(vaultId, noteId);
  const [row] = await db
    .select({
      id: noteVersions.id,
      source: noteVersions.source,
      createdAt: noteVersions.createdAt,
      content: noteVersions.content,
      frontmatter: noteVersions.frontmatter,
    })
    .from(noteVersions)
    .where(and(eq(noteVersions.id, versionId), eq(noteVersions.noteId, noteId)))
    .limit(1);
  return row ?? null;
}

async function assertNoteInVault(vaultId: string, noteId: string) {
  const [note] = await db
    .select({ id: notes.id })
    .from(notes)
    .where(and(eq(notes.vaultId, vaultId), eq(notes.id, noteId)))
    .limit(1);
  if (!note) throw new ApiError("Nota no encontrada", 404);
}

export async function restoreVersion(
  vaultId: string,
  noteId: string,
  versionId: string,
  userId: string,
) {
  await assertNoteInVault(vaultId, noteId);
  const [version] = await db
    .select()
    .from(noteVersions)
    .where(and(eq(noteVersions.id, versionId), eq(noteVersions.noteId, noteId)))
    .limit(1);
  if (!version) throw new Error("Versión no encontrada");
  const [note] = await db.select().from(notes).where(eq(notes.id, noteId)).limit(1);
  if (!note) throw new Error("Nota no encontrada");

  await updateNote({
    vaultId,
    noteId,
    userId,
    content: version.content,
    source: "restore",
  });
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Replaces/removes inline #tags outside fenced code and inline code. */
function changeInlineTag(body: string, tag: string, next: string | null) {
  const hashTag = `#${escapeRegExp(tag)}`;
  const re = new RegExp(`(^|[\\s(\\[])${hashTag}(?![\\p{L}\\p{N}_/-])`, "gu");
  return body
    .split(/(```[\s\S]*?```|`[^`\n]*`)/g)
    .map((part, index) =>
      index % 2 === 1 ? part : part.replace(re, next ? `$1#${next}` : "$1"),
    )
    .join("");
}

function withTagChange(
  content: string,
  tag: string,
  mode: "add" | "remove" | "rename",
  nextTag?: string,
) {
  const clean = normalizeTag(tag);
  if (!clean) return content;
  const parsed = parseFrontmatter(content);
  const current = getFrontmatterTags(parsed.frontmatter);
  const lower = clean.toLowerCase();
  const nextLower = nextTag?.toLowerCase();
  let tags = current.filter((item) => item.toLowerCase() !== lower);

  if (mode === "add") {
    if (!current.some((item) => item.toLowerCase() === lower)) tags.push(clean);
  } else if (mode === "rename" && nextTag) {
    const already = tags.some((item) => item.toLowerCase() === nextLower);
    if (!already) tags.push(nextTag);
  }

  tags = Array.from(
    new Map(tags.map((item) => [item.toLowerCase(), item])).values(),
  );
  let body = parsed.body;
  if (mode !== "add" && mode !== "remove") {
    body = changeInlineTag(body, clean, nextTag ?? null);
  } else if (mode === "remove") {
    body = changeInlineTag(body, clean, null);
  }

  const frontmatter: Frontmatter = { ...parsed.frontmatter };
  delete frontmatter.tag;
  if (tags.length) frontmatter.tags = tags;
  else delete frontmatter.tags;

  return serializeFrontmatter(frontmatter, body);
}

export async function addTagToNote(input: {
  vaultId: string;
  noteId: string;
  userId: string;
  tag: string;
  remove?: boolean;
}) {
  const note = await getNote(input.vaultId, input.noteId);
  if (!note) throw new Error("Nota no encontrada");
  const next = withTagChange(note.content, input.tag, input.remove ? "remove" : "add");
  if (next === note.content) return note;
  return updateNote({
    vaultId: input.vaultId,
    noteId: input.noteId,
    userId: input.userId,
    content: next,
    source: "api",
  });
}

export async function renameTag(input: {
  vaultId: string;
  userId: string;
  from: string;
  to: string;
}) {
  const from = normalizeTag(input.from);
  const to = normalizeTag(input.to);
  if (!from || !to) throw new Error("Etiqueta no válida");
  const rows = await db
    .select({ noteId: noteTags.noteId })
    .from(noteTags)
    .innerJoin(tags, eq(noteTags.tagId, tags.id))
    .where(
      and(
        eq(tags.vaultId, input.vaultId),
        sql`lower(${tags.name}) = ${from.toLowerCase()}`,
      ),
    );
  const noteIds = Array.from(new Set(rows.map((row) => row.noteId)));
  let updated = 0;
  for (const noteId of noteIds) {
    const note = await getNote(input.vaultId, noteId);
    if (!note) continue;
    const next = withTagChange(
      note.content,
      from,
      from.toLowerCase() === to.toLowerCase() ? "rename" : "rename",
      to,
    );
    if (next === note.content) continue;
    await updateNote({
      vaultId: input.vaultId,
      noteId,
      userId: input.userId,
      content: next,
      source: "api",
    });
    updated++;
  }
  if (from.toLowerCase() !== to.toLowerCase()) {
    await db
      .delete(tags)
      .where(
        and(
          eq(tags.vaultId, input.vaultId),
          sql`lower(${tags.name}) = ${from.toLowerCase()}`,
        ),
      );
  }
  return { updated };
}

export async function deleteTag(input: {
  vaultId: string;
  userId: string;
  name: string;
}) {
  const name = normalizeTag(input.name);
  if (!name) throw new Error("Etiqueta no válida");
  const rows = await db
    .select({ noteId: noteTags.noteId })
    .from(noteTags)
    .innerJoin(tags, eq(noteTags.tagId, tags.id))
    .where(
      and(
        eq(tags.vaultId, input.vaultId),
        sql`lower(${tags.name}) = ${name.toLowerCase()}`,
      ),
    );
  let updated = 0;
  for (const noteId of Array.from(new Set(rows.map((row) => row.noteId)))) {
    const note = await getNote(input.vaultId, noteId);
    if (!note) continue;
    const next = withTagChange(note.content, name, "remove");
    if (next === note.content) continue;
    await updateNote({
      vaultId: input.vaultId,
      noteId,
      userId: input.userId,
      content: next,
      source: "api",
    });
    updated++;
  }
  await db
    .delete(tags)
    .where(
      and(
        eq(tags.vaultId, input.vaultId),
        sql`lower(${tags.name}) = ${name.toLowerCase()}`,
      ),
    );
  return { updated };
}

export type BatchAction = "move" | "tag" | "untag" | "delete" | "pin" | "unpin";

export async function batchNotes(input: {
  vaultId: string;
  userId: string;
  ids: string[];
  action: BatchAction;
  folder?: string;
  tag?: string;
}) {
  const ids = Array.from(new Set(input.ids)).slice(0, 250);
  const rows = await db
    .select({ id: notes.id, path: notes.path })
    .from(notes)
    .where(
      and(
        eq(notes.vaultId, input.vaultId),
        inArray(notes.id, ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
        isNull(notes.deletedAt),
      ),
    );
  const results: Array<{ id: string; ok: boolean; error?: string }> = [];
  const folder = normalizeVaultPath(input.folder ?? "");

  for (const note of rows) {
    try {
      if (input.action === "move") {
        const filename = note.path.split("/").pop();
        if (!filename) throw new Error("Ruta no válida");
        const nextPath = folder ? `${folder}/${filename}` : filename;
        if (nextPath.toLowerCase() !== note.path.toLowerCase()) {
          await updateNote({
            vaultId: input.vaultId,
            noteId: note.id,
            userId: input.userId,
            path: nextPath,
            source: "api",
          });
        }
      } else if (input.action === "tag" || input.action === "untag") {
        if (!input.tag?.trim()) throw new Error("Falta la etiqueta");
        await addTagToNote({
          vaultId: input.vaultId,
          noteId: note.id,
          userId: input.userId,
          tag: input.tag,
          remove: input.action === "untag",
        });
      } else if (input.action === "delete") {
        await deleteNote(input.vaultId, note.id);
      } else if (input.action === "pin" || input.action === "unpin") {
        await db
          .update(notes)
          .set({
            pinnedAt: input.action === "pin" ? new Date() : null,
            updatedAt: new Date(),
          })
          .where(eq(notes.id, note.id));
      }
      results.push({ id: note.id, ok: true });
    } catch (error) {
      results.push({
        id: note.id,
        ok: false,
        error: error instanceof Error ? error.message : "Error",
      });
    }
  }

  return {
    results,
    updated: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length,
  };
}

export async function setNotePinned(
  vaultId: string,
  noteId: string,
  pinned: boolean,
) {
  await db
    .update(notes)
    .set({ pinnedAt: pinned ? new Date() : null, updatedAt: new Date() })
    .where(and(eq(notes.vaultId, vaultId), eq(notes.id, noteId)));
}

export async function trackNoteOpen(userId: string, vaultId: string, noteId: string) {
  const [note] = await db
    .select({ id: notes.id })
    .from(notes)
    .where(and(eq(notes.vaultId, vaultId), eq(notes.id, noteId), isNull(notes.deletedAt)))
    .limit(1);
  if (!note) return;
  await db
    .insert(noteOpens)
    .values({ userId, noteId })
    .onConflictDoUpdate({
      target: [noteOpens.userId, noteOpens.noteId],
      set: {
        openCount: sql`${noteOpens.openCount} + 1`,
        lastOpenedAt: new Date(),
      },
    });
}

export type SmartViews = {
  favorites: NoteSummary[];
  recents: NoteSummary[];
  orphans: NoteSummary[];
  untagged: NoteSummary[];
};

export async function listSmartViews(
  vaultId: string,
  userId: string,
): Promise<SmartViews> {
  const alive = and(eq(notes.vaultId, vaultId), isNull(notes.deletedAt));
  const summary = {
    id: notes.id,
    path: notes.path,
    title: notes.title,
    updatedAt: notes.updatedAt,
    wordCount: notes.wordCount,
  };

  const [favorites, recents, orphans, untagged] = await Promise.all([
    db
      .select(summary)
      .from(notes)
      .where(and(alive, sql`${notes.pinnedAt} is not null`))
      .orderBy(desc(notes.pinnedAt))
      .limit(50),
    db
      .select(summary)
      .from(noteOpens)
      .innerJoin(notes, eq(noteOpens.noteId, notes.id))
      .where(
        and(
          eq(noteOpens.userId, userId),
          eq(notes.vaultId, vaultId),
          isNull(notes.deletedAt),
        ),
      )
      .orderBy(desc(noteOpens.lastOpenedAt))
      .limit(20),
    db
      .select(summary)
      .from(notes)
      .where(
        and(
          alive,
          notExists(
            db
              .select({ id: links.id })
              .from(links)
              .where(or(eq(links.sourceNoteId, notes.id), eq(links.targetNoteId, notes.id))),
          ),
        ),
      )
      .orderBy(asc(notes.path))
      .limit(200),
    db
      .select(summary)
      .from(notes)
      .where(
        and(
          alive,
          notExists(
            db
              .select({ noteId: noteTags.noteId })
              .from(noteTags)
              .where(eq(noteTags.noteId, notes.id)),
          ),
        ),
      )
      .orderBy(asc(notes.path))
      .limit(200),
  ]);

  return { favorites, recents, orphans, untagged };
}

/** Rebuilds links and tags for a note. Called after every save. */
export async function syncNoteDerived(noteId: string) {
  const [note] = await db.select().from(notes).where(eq(notes.id, noteId)).limit(1);
  if (!note) return;

  const parsed = parseFrontmatter(note.content);
  const all = await db
    .select({ id: notes.id, path: notes.path, frontmatter: notes.frontmatter })
    .from(notes)
    .where(and(eq(notes.vaultId, note.vaultId), isNull(notes.deletedAt)));

  const resolvable = buildAliasMap(all);
  const parsedLinks = parseLinks(parsed.body);

  await db.delete(links).where(eq(links.sourceNoteId, noteId));

  const rows = parsedLinks.map((link) => {
    const target = resolveLink(link.target, note.path, resolvable);
    return {
      vaultId: note.vaultId,
      sourceNoteId: noteId,
      rawTarget: link.rawTarget,
      targetPath: target?.path ?? link.target,
      targetNoteId: target?.id ?? null,
      kind: link.kind,
      heading: link.heading,
      alias: link.alias,
      resolved: Boolean(target),
    };
  });
  if (rows.length) {
    for (let i = 0; i < rows.length; i += 200) {
      await db.insert(links).values(rows.slice(i, i + 200));
    }
  }

  const noteTagNames = collectTags(parsed.frontmatter, parsed.body);
  await db.delete(noteTags).where(eq(noteTags.noteId, noteId));

  for (const name of noteTagNames) {
    const existing = await db
      .select({ id: tags.id })
      .from(tags)
      .where(and(eq(tags.vaultId, note.vaultId), sql`lower(${tags.name}) = ${name.toLowerCase()}`))
      .limit(1);

    let tagId = existing[0]?.id;
    if (!tagId) {
      // Upsert: si otra petición creó la etiqueta a la vez, recuperamos la suya
      // en lugar de chocar con el índice único.
      const inserted = await db
        .insert(tags)
        .values({ vaultId: note.vaultId, name })
        .onConflictDoNothing()
        .returning({ id: tags.id });
      if (inserted[0]) {
        tagId = inserted[0].id;
      } else {
        const [winner] = await db
          .select({ id: tags.id })
          .from(tags)
          .where(and(eq(tags.vaultId, note.vaultId), sql`lower(${tags.name}) = ${name.toLowerCase()}`))
          .limit(1);
        tagId = winner?.id;
      }
    }
    if (!tagId) continue;
    await db.insert(noteTags).values({ noteId, tagId }).onConflictDoNothing();
  }
}

export async function listTags(vaultId: string) {
  return db
    .select({ name: tags.name, count: sql<number>`count(${noteTags.noteId})`.mapWith(Number) })
    .from(tags)
    .leftJoin(noteTags, eq(noteTags.tagId, tags.id))
    .where(eq(tags.vaultId, vaultId))
    .groupBy(tags.name)
    .orderBy(desc(sql`count(${noteTags.noteId})`));
}

export async function buildTree(vaultId: string, userId?: string) {
  const [noteRows, folderRows, tagRows, views] = await Promise.all([
    listNotes(vaultId),
    listFolders(vaultId),
    listTags(vaultId),
    userId
      ? listSmartViews(vaultId, userId)
      : Promise.resolve({ favorites: [], recents: [], orphans: [], untagged: [] }),
  ]);

  const folderSet = new Set<string>(folderRows.map((folder) => folder.path));
  for (const note of noteRows) {
    const parts = note.path.split("/").slice(0, -1);
    for (let i = 1; i <= parts.length; i++) folderSet.add(parts.slice(0, i).join("/"));
  }

  return {
    notes: noteRows,
    folders: Array.from(folderSet).sort((a, b) => a.localeCompare(b, "es")),
    tags: tagRows,
    views,
  };
}

export async function buildGraph(vaultId: string) {
  const [noteRows, linkRows] = await Promise.all([
    db
      .select({ id: notes.id, path: notes.path, title: notes.title })
      .from(notes)
      .where(and(eq(notes.vaultId, vaultId), isNull(notes.deletedAt))),
    db
      .select({
        source: links.sourceNoteId,
        target: links.targetNoteId,
      })
      .from(links)
      .where(eq(links.vaultId, vaultId)),
  ]);

  return {
    nodes: noteRows.map((note) => ({ id: note.id, label: note.title, path: note.path })),
    edges: linkRows
      .filter((link): link is { source: string; target: string } => Boolean(link.target))
      .map((link) => ({ source: link.source, target: link.target })),
  };
}

export async function reindexVault(vaultId: string, limit = 10) {
  const { indexNote } = await import("@/lib/ai/indexer");
  const pending = await db
    .select({ id: notes.id })
    .from(notes)
    .where(and(eq(notes.vaultId, vaultId), isNull(notes.deletedAt)))
    .limit(limit);
  for (const note of pending) {
    await indexNote(note.id);
  }
  return pending.length;
}
