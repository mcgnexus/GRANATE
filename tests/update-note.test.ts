import { beforeEach, describe, expect, it, vi } from "vitest";

// ---- Base de datos simulada: cola de selects, registros de escrituras y batches ----
const selectQueue: unknown[][] = [];
const updateSets: Array<{ table: string; values: unknown }> = [];
const inserts: Array<{ table: string; values: unknown; via: string }> = [];
const batches: unknown[][] = [];
const returningResults: unknown[][] = [];

vi.mock("@/lib/db", () => ({
  db: {
    select: () => {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      chain.from = self;
      chain.where = self;
      chain.innerJoin = self;
      chain.leftJoin = self;
      chain.orderBy = self;
      chain.limit = () => Promise.resolve(selectQueue.shift() ?? []);
      chain.then = (
        onFulfilled: (value: unknown) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) => Promise.resolve(selectQueue.shift() ?? []).then(onFulfilled, onRejected);
      return chain;
    },
    insert: (table: unknown) => {
      const name = tableName(table);
      let values: unknown;
      let via = "then";
      const builder: Record<string, unknown> = {
        get lastValues() {
          return values;
        },
        values: (v: unknown) => {
          values = v;
          return builder;
        },
        onConflictDoNothing: () => {
          via = "conflict";
          return builder;
        },
        onConflictDoUpdate: () => {
          via = "conflict";
          return builder;
        },
        returning: () => {
          inserts.push({ table: name, values, via });
          const result = returningResults.shift() ?? [{ id: "gen-id" }];
          return Promise.resolve(result);
        },
        then: (
          onFulfilled: (value: unknown) => unknown,
          onRejected?: (reason: unknown) => unknown,
        ) => {
          inserts.push({ table: name, values, via });
          return Promise.resolve([]).then(onFulfilled, onRejected);
        },
      };
      return builder;
    },
    update: (table: unknown) => {
      const name = tableName(table);
      let setValues: unknown;
      const builder: Record<string, unknown> = {
        get lastValues() {
          return setValues;
        },
        set: (v: unknown) => {
          setValues = v;
          return builder;
        },
        where: () => {
          updateSets.push({ table: name, values: setValues });
          return builder;
        },
        returning: () => Promise.resolve([{ frontmatter: {}, contentHash: "x" }]),
        then: (
          onFulfilled: (value: unknown) => unknown,
          onRejected?: (reason: unknown) => unknown,
        ) => Promise.resolve([{ frontmatter: {}, contentHash: "x" }]).then(onFulfilled, onRejected),
      };
      return builder;
    },
    delete: () => {
      const builder: Record<string, unknown> = {
        where: () => Promise.resolve(),
      };
      return builder;
    },
    batch: (statements: unknown[]) => {
      batches.push(statements);
      return Promise.resolve([]);
    },
  },
}));

const tableLabels = new WeakMap<object, string>();
let labelCounter = 0;
function tableName(table: unknown): string {
  if (typeof table !== "object" || table === null) return String(table);
  const key = table as object;
  if (!tableLabels.has(key)) tableLabels.set(key, `tabla-${++labelCounter}`);
  return tableLabels.get(key) as string;
}

import { notes, noteVersions, folders, tags, links, noteTags } from "@/lib/db/schema";
import { updateNote } from "@/lib/notes";

const EXISTING = {
  id: "n1",
  vaultId: "v1",
  path: "Old.md",
  title: "Old",
  content: "# Old\n\nTexto\n",
  frontmatter: {},
  contentHash: "h1",
  wordCount: 4,
  createdBy: "u1",
  updatedBy: "u1",
  updatedAt: new Date("2026-01-01T00:00:00Z"),
  mtime: new Date("2026-01-01T00:00:00Z"),
  deletedAt: null,
};

function label(name: string) {
  return (table: object) => {
    tableLabels.set(table, name);
    return table;
  };
}

beforeEach(() => {
  selectQueue.length = 0;
  updateSets.length = 0;
  inserts.length = 0;
  batches.length = 0;
  returningResults.length = 0;
  label("notes")(notes);
  label("noteVersions")(noteVersions);
  label("folders")(folders);
  label("tags")(tags);
  label("links")(links);
  label("noteTags")(noteTags);
});

describe("updateNote: cambios solo de ruta", () => {
  it("no reescribe contenido ni crea versión al renombrar", async () => {
    selectQueue.push([EXISTING]); // lectura de la nota
    selectQueue.push([]); // notas para reescritura de enlaces
    selectQueue.push([{ ...EXISTING, path: "Carpetas/New.md", title: "New" }]); // relectura final

    await updateNote({
      vaultId: "v1",
      noteId: "n1",
      userId: "u1",
      path: "Carpetas/New.md",
      source: "api",
    });

    expect(updateSets).toHaveLength(1);
    const set = updateSets[0].values as Record<string, unknown>;
    expect(set).toMatchObject({ path: "Carpetas/New.md", title: "New" });
    expect(set).not.toHaveProperty("content");
    expect(set).not.toHaveProperty("contentHash");
    expect(set).not.toHaveProperty("wordCount");

    // un único batch atómico: update + carpeta nueva (sin versión ni derivados)
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(2);
    const versionInserts = inserts.filter((row) => row.table === "noteVersions");
    expect(versionInserts).toHaveLength(0);
  });

  it("reescribe el contenido cuando la petición lo incluye", async () => {
    selectQueue.push([EXISTING]); // lectura de la nota
    selectQueue.push([{ ...EXISTING, content: "# Nuevo\n" }]); // derivados: releen la nota
    selectQueue.push([]); // derivados: listado de notas
    selectQueue.push([{ ...EXISTING, content: "# Nuevo\n" }]); // relectura final

    await updateNote({
      vaultId: "v1",
      noteId: "n1",
      userId: "u1",
      content: "# Nuevo\n",
      source: "save",
    });

    const noteUpdate = updateSets.find((row) => row.table === "notes");
    expect(noteUpdate?.values).toMatchObject({ content: "# Nuevo\n" });

    // batch atómico: update + versión + borrado de enlaces + borrado de etiquetas
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(4);
  });
});

describe("updateNote: creación de etiquetas sin carrera", () => {
  it("recupera la etiqueta creada por otra petición cuando el upsert pierde", async () => {
    const withTag = { ...EXISTING, content: "---\ntags: [proyecto]\n---\n\nTexto\n" };
    selectQueue.push([EXISTING]); // lectura de la nota
    selectQueue.push([withTag]); // derivados: releen la nota
    selectQueue.push([]); // derivados: listado de notas
    selectQueue.push([]); // búsqueda de la etiqueta: no existe aún
    returningResults.push([]); // insert con onConflictDoNothing pierde la carrera
    selectQueue.push([{ id: "t-win" }]); // la otra petición la creó
    selectQueue.push([{ ...withTag }]); // relectura final

    await updateNote({
      vaultId: "v1",
      noteId: "n1",
      userId: "u1",
      content: "---\ntags: [proyecto]\n---\n\nTexto\n",
      source: "api",
    });

    // batch atómico: update, versión, borrados, upsert de etiqueta y asociación
    // por subconsulta (ve la etiqueta creada en este mismo lote o ya confirmada)
    expect(batches).toHaveLength(1);
    const statements = batches[0] as Array<{ lastValues?: unknown }>;
    expect(statements).toHaveLength(6);
    expect(statements[4]?.lastValues).toMatchObject({ name: "proyecto" });
    const noteTagValues = statements[5]?.lastValues as Record<string, unknown>;
    expect(noteTagValues).toHaveProperty("noteId", "n1");
    expect(noteTagValues).toHaveProperty("tagId");
  });
});
