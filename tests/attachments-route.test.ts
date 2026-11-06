import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/http", () => ({
  withVault: vi.fn(async () => ({ user: { id: "u1" }, vault: { id: "v1", role: "owner" } })),
  apiError: (error: unknown) =>
    Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 }),
}));

const selectResult: Array<Record<string, unknown>> = [];
const inserted: Array<Record<string, unknown>> = [];
const deletedWhere: unknown[] = [];
const updatedWhere: unknown[] = [];
const removedRefs: Array<string | null> = [];

vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(selectResult),
          orderBy: () => Promise.resolve(selectResult),
        }),
        orderBy: () => Promise.resolve(selectResult),
      }),
    }),
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        inserted.push(values);
        return Promise.resolve();
      },
    }),
    update: () => ({
      set: () => ({
        where: (where: unknown) => {
          updatedWhere.push(where);
          return Promise.resolve();
        },
      }),
    }),
    delete: () => ({
      where: (where: unknown) => {
        deletedWhere.push(where);
        return Promise.resolve();
      },
    }),
  },
}));

vi.mock("@vercel/blob", () => ({
  put: vi.fn(),
}));

vi.mock("@/lib/storage", () => ({
  storageProvider: () => "postgres",
  attachmentKey: vi.fn(),
  b2KeyFromRef: vi.fn(),
  isB2Ref: () => false,
  putB2: vi.fn(),
  signedB2Url: vi.fn(),
}));

vi.mock("@/lib/storage-cleanup", () => ({
  removeStoredRef: (ref: string | null) => {
    removedRefs.push(ref);
    return Promise.resolve();
  },
}));

vi.mock("@/lib/import-export", () => ({
  guessMime: () => "application/octet-stream",
}));

import { safePath } from "@/app/api/v1/vaults/[vaultId]/attachments/route";

const { GET, POST, DELETE } = await import("@/app/api/v1/vaults/[vaultId]/attachments/route");

const BASE = "http://localhost/api/v1/vaults/v1/attachments";

beforeEach(() => {
  selectResult.length = 0;
  inserted.length = 0;
  deletedWhere.length = 0;
  updatedWhere.length = 0;
  removedRefs.length = 0;
});

describe("safePath", () => {
  it("acepta rutas Unicode y con espacios o paréntesis", () => {
    expect(safePath("diseño.png")).toBe(true);
    expect(safePath("informe (1).pdf")).toBe(true);
    expect(safePath("Notas/cañas y versión final.md")).toBe(true);
    expect(safePath("日本語/メモ.png")).toBe(true);
  });

  it("rechaza traversal, separadores de Windows y rutas vacías", () => {
    expect(safePath("")).toBe(false);
    expect(safePath("../secreto")).toBe(false);
    expect(safePath("a/../b")).toBe(false);
    expect(safePath("..")).toBe(false);
    expect(safePath("a\\b.png")).toBe(false);
    expect(safePath("/absoluta.png")).toBe(false);
    expect(safePath("a//b.png")).toBe(false);
    expect(safePath("a/./b.png")).toBe(false);
    expect(safePath("con\nsalto.png")).toBe(false);
    expect(safePath(`${"a".repeat(513)}`)).toBe(false);
  });
});

describe("POST /api/v1/vaults/[vaultId]/attachments", () => {
  async function post(path: string, file?: File) {
    const form = new FormData();
    form.set("file", file ?? new File(["contenido"], "f.bin", { type: "text/plain" }));
    form.set("path", path);
    const request = new NextRequest(BASE, { method: "POST", body: form });
    return POST(request, { params: Promise.resolve({ vaultId: "v1" }) });
  }

  it("rechaza rutas con traversal sin tocar la base de datos", async () => {
    const response = await post("../escape.png");
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Path inválido" });
    expect(inserted).toHaveLength(0);
    expect(updatedWhere).toHaveLength(0);
  });

  it("acepta nombres con tildes, espacios y paréntesis", async () => {
    const response = await post("diseño (2).png", new File([new Uint8Array([1, 2, 3])], "x", { type: "image/png" }));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toMatchObject({ ok: true, path: "diseño (2).png", storage: "postgres" });
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ vaultId: "v1", path: "diseño (2).png", mime: "image/png" });
  });

  it("rechaza peticiones sin archivo", async () => {
    const form = new FormData();
    form.set("path", "ok.png");
    const request = new NextRequest(BASE, { method: "POST", body: form });
    const response = await POST(request, { params: Promise.resolve({ vaultId: "v1" }) });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Faltan file o path" });
  });
});

describe("GET /api/v1/vaults/[vaultId]/attachments", () => {
  it("rechaza paths inválidos antes de consultar", async () => {
    const request = new NextRequest(`${BASE}?path=${encodeURIComponent("../x.png")}`);
    const response = await GET(request, { params: Promise.resolve({ vaultId: "v1" }) });
    expect(response.status).toBe(400);
  });

  it("devuelve 404 si el adjunto no existe", async () => {
    selectResult.length = 0;
    const request = new NextRequest(`${BASE}?path=dise%C3%B1o.png`);
    const response = await GET(request, { params: Promise.resolve({ vaultId: "v1" }) });
    expect(response.status).toBe(404);
  });

  it("devuelve el contenido en línea con cabeceras de seguridad", async () => {
    selectResult.length = 0;
    selectResult.push({
      id: "a1",
      vaultId: "v1",
      path: "diseño.png",
      mime: "image/png",
      size: 3,
      blobUrl: null,
      data: Buffer.from([1, 2, 3]).toString("base64"),
      createdAt: new Date(),
      sha256: "x",
    });
    const request = new NextRequest(`${BASE}?path=dise%C3%B1o.png`);
    const response = await GET(request, { params: Promise.resolve({ vaultId: "v1" }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Security-Policy")).toContain("sandbox");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([...bytes]).toEqual([1, 2, 3]);
  });
});

describe("DELETE /api/v1/vaults/[vaultId]/attachments", () => {
  it("rechaza paths inválidos", async () => {
    const request = new NextRequest(`${BASE}?path=${encodeURIComponent("a/../b")}`, { method: "DELETE" });
    const response = await DELETE(request, { params: Promise.resolve({ vaultId: "v1" }) });
    expect(response.status).toBe(400);
    expect(deletedWhere).toHaveLength(0);
  });

  it("elimina el adjunto y limpia la referencia de almacenamiento", async () => {
    selectResult.length = 0;
    selectResult.push({ id: "a1", blobUrl: "https://blob.example.com/vaults/v1/diseño.png", data: null });
    const request = new NextRequest(`${BASE}?path=dise%C3%B1o.png`, { method: "DELETE" });
    const response = await DELETE(request, { params: Promise.resolve({ vaultId: "v1" }) });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(removedRefs).toEqual(["https://blob.example.com/vaults/v1/diseño.png"]);
    expect(deletedWhere).toHaveLength(1);
  });
});
