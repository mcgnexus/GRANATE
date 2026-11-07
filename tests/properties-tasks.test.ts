import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const selectQueue: unknown[][] = [];

vi.mock("@/lib/db", () => ({
  db: {
    select: () => {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      chain.from = self;
      chain.where = self;
      chain.limit = () => Promise.resolve(selectQueue.shift() ?? []);
      chain.then = (
        onFulfilled: (value: unknown) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) => Promise.resolve(selectQueue.shift() ?? []).then(onFulfilled, onRejected);
      return chain;
    },
  },
}));

vi.mock("@/lib/http", () => ({
  withVault: vi.fn(async () => ({ user: { id: "u1" }, vault: { id: "v1", role: "owner" } })),
  apiError: (error: unknown) =>
    Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 }),
}));

import { GET as getProperties } from "@/app/api/v1/vaults/[vaultId]/properties/route";
import { GET as getTasks } from "@/app/api/v1/vaults/[vaultId]/tasks/route";

const BASE = "http://localhost/api/v1/vaults/v1";

beforeEach(() => {
  selectQueue.length = 0;
});

describe("GET /properties", () => {
  it("agrega propiedades de frontmatter con conteo y notas", async () => {
    selectQueue.push([
      { id: "n1", path: "A.md", content: "---\ntags: [x]\nstatus: done\n---\n\nhola" },
      { id: "n2", path: "B.md", content: "---\nstatus: todo\n---\n\nadios" },
      { id: "n3", path: "C.md", content: "sin frontmatter" },
    ]);
    const request = new NextRequest(`${BASE}/properties`);
    const response = await getProperties(request, { params: Promise.resolve({ vaultId: "v1" }) });
    expect(response.status).toBe(200);
    const data = (await response.json()) as { properties: Array<{ key: string; count: number; notes: unknown[] }> };
    const status = data.properties.find((p) => p.key === "status");
    const tags = data.properties.find((p) => p.key === "tags");
    expect(status).toMatchObject({ count: 2 });
    expect(status?.notes).toHaveLength(2);
    expect(tags).toMatchObject({ count: 1 });
  });

  it("devuelve lista vacía sin propiedades", async () => {
    selectQueue.push([{ id: "n1", path: "A.md", content: "solo texto" }]);
    const request = new NextRequest(`${BASE}/properties`);
    const response = await getProperties(request, { params: Promise.resolve({ vaultId: "v1" }) });
    const data = (await response.json()) as { properties: unknown[] };
    expect(data.properties).toEqual([]);
  });
});

describe("GET /tasks", () => {
  it("extrae tareas pendientes y hechas con nota y línea", async () => {
    selectQueue.push([
      { id: "n1", path: "A.md", content: "# Tareas\n- [ ] Pendiente\n- [x] Hecha\n- [X] También hecha\nTexto" },
      { id: "n2", path: "B.md", content: "Sin tareas aquí" },
    ]);
    const request = new NextRequest(`${BASE}/tasks`);
    const response = await getTasks(request, { params: Promise.resolve({ vaultId: "v1" }) });
    expect(response.status).toBe(200);
    const data = (await response.json()) as { tasks: Array<{ path: string; text: string; done: boolean; line: number }> };
    expect(data.tasks).toHaveLength(3);
    expect(data.tasks[0]).toMatchObject({ path: "A.md", text: "Pendiente", done: false, line: 2 });
    expect(data.tasks[1]).toMatchObject({ text: "Hecha", done: true, line: 3 });
    expect(data.tasks[2]).toMatchObject({ text: "También hecha", done: true, line: 4 });
  });

  it("devuelve lista vacía sin tareas", async () => {
    selectQueue.push([{ id: "n1", path: "A.md", content: "sin checkboxes" }]);
    const request = new NextRequest(`${BASE}/tasks`);
    const response = await getTasks(request, { params: Promise.resolve({ vaultId: "v1" }) });
    const data = (await response.json()) as { tasks: unknown[] };
    expect(data.tasks).toEqual([]);
  });
});
