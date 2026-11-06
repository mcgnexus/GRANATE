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
      chain.innerJoin = self;
      chain.limit = () => Promise.resolve(selectQueue.shift() ?? []);
      chain.then = (
        onFulfilled: (value: unknown) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) => Promise.resolve(selectQueue.shift() ?? []).then(onFulfilled, onRejected);
      return chain;
    },
  },
}));

vi.mock("@/lib/storage", () => ({
  isB2Ref: () => false,
  b2KeyFromRef: vi.fn(),
  signedB2Url: vi.fn(),
}));

const { GET } = await import("@/app/s/[token]/raw/route");

const SHARED_NOTE = {
  id: "n1",
  vaultId: "v1",
  path: "Presentación.md",
  content: "Mira el documento ![doc](docs/publico.pdf) y el esquema [[private/esquema.png]].",
  deletedAt: null,
};

const ATTACHMENT_PUBLIC = {
  id: "a1",
  vaultId: "v1",
  path: "docs/publico.pdf",
  mime: "application/pdf",
  size: 7,
  blobUrl: null,
  data: Buffer.from("PUBLICO").toString("base64"),
};

const ATTACHMENT_PRIVATE = {
  id: "a2",
  vaultId: "v1",
  path: "privado/contrato.pdf",
  mime: "application/pdf",
  size: 8,
  blobUrl: null,
  data: Buffer.from("SECRETO").toString("base64"),
};

function get(path: string) {
  const request = new NextRequest(`http://localhost/s/tok/raw?path=${encodeURIComponent(path)}`);
  return GET(request, { params: Promise.resolve({ token: "tok" }) });
}

beforeEach(() => {
  selectQueue.length = 0;
});

describe("GET /s/[token]/raw (alcance de adjuntos)", () => {
  it("sirve un adjunto referenciado por la nota compartida", async () => {
    selectQueue.push([
      { vaultId: "v1", noteId: "n1", expiresAt: null, revokedAt: null },
    ]);
    selectQueue.push([{ content: SHARED_NOTE.content }]);
    selectQueue.push([ATTACHMENT_PUBLIC]);

    const response = await get("docs/publico.pdf");
    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("PUBLICO");
  });

  it("rechaza un adjunto de la bóveda que la nota no referencia", async () => {
    selectQueue.push([
      { vaultId: "v1", noteId: "n1", expiresAt: null, revokedAt: null },
    ]);
    selectQueue.push([{ content: SHARED_NOTE.content }]);

    const response = await get("privado/contrato.pdf");
    expect(response.status).toBe(404);
  });

  it("rechaza si la nota del enlace fue eliminada", async () => {
    selectQueue.push([
      { vaultId: "v1", noteId: "n1", expiresAt: null, revokedAt: null },
    ]);
    selectQueue.push([]);

    const response = await get("docs/publico.pdf");
    expect(response.status).toBe(404);
  });

  it("acepta referencias codificadas en la URL dentro del contenido", async () => {
    const withSpaces = {
      ...SHARED_NOTE,
      content: "Ver ![x](docs/mi%20informe.pdf).",
    };
    selectQueue.push([
      { vaultId: "v1", noteId: "n1", expiresAt: null, revokedAt: null },
    ]);
    selectQueue.push([{ content: withSpaces.content }]);
    selectQueue.push([
      {
        ...ATTACHMENT_PUBLIC,
        path: "docs/mi informe.pdf",
        data: Buffer.from("INFORME").toString("base64"),
      },
    ]);

    const response = await get("docs/mi informe.pdf");
    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("INFORME");
  });

  it("un enlace de bóveda completa mantiene acceso a cualquier adjunto", async () => {
    selectQueue.push([
      { vaultId: "v1", noteId: null, expiresAt: null, revokedAt: null },
    ]);
    selectQueue.push([ATTACHMENT_PRIVATE]);

    const response = await get("privado/contrato.pdf");
    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("SECRETO");
  });

  it("rechaza tokens revocados", async () => {
    selectQueue.push([
      {
        vaultId: "v1",
        noteId: null,
        expiresAt: null,
        revokedAt: new Date("2026-01-01T00:00:00Z"),
      },
    ]);

    const response = await get("docs/publico.pdf");
    expect(response.status).toBe(404);
  });
});
