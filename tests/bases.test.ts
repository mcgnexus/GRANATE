import { describe, expect, it } from "vitest";
import { evaluateBase, parseBase } from "@/lib/bases";

const notes = [
  {
    id: "1",
    path: "10 - TecRural/A.md",
    title: "A",
    frontmatter: { status: "hecho", prioridad: 2 },
    tags: ["sensores"],
  },
  {
    id: "2",
    path: "10 - TecRural/B.md",
    title: "B",
    frontmatter: { status: "pendiente", prioridad: 1 },
    tags: ["riego"],
  },
  {
    id: "3",
    path: "99 - Archivo/C.md",
    title: "C",
    frontmatter: { status: "pendiente" },
    tags: ["sensores", "riego"],
  },
];

describe("bases", () => {
  it("evaluates inFolder and hasTag filters", () => {
    const base = parseBase(`
filters:
  and:
    - file.inFolder("10 - TecRural")
    - file.hasTag("sensores")
views:
  - type: table
    name: Tabla
    order: [file.name, note.status]
`);
    const result = evaluateBase(base, notes);
    expect(result.rows.map((row) => row.title)).toEqual(["A"]);
    expect(result.columns).toEqual(["file.name", "note.status"]);
  });

  it("sorts and groups", () => {
    const base = parseBase(`
views:
  - type: table
    name: Por estado
    order: [file.name, note.status]
    sort:
      - property: note.prioridad
        direction: DESC
    groupBy:
      property: note.status
`);
    const result = evaluateBase(base, notes);
    expect(result.rows[0].title).toBe("A");
    expect(result.groups?.map((group) => group.key).sort()).toEqual(["hecho", "pendiente"]);
  });

  it("supports comparison expressions", () => {
    const base = parseBase(`
filters: 'note.status == "pendiente"'
views:
  - type: table
    name: Pendientes
`);
    const result = evaluateBase(base, notes);
    expect(result.rows).toHaveLength(2);
  });
});
