// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VaultAccess } from "@/lib/auth/api";

// ---- Hijos pesados sustituidos por stubs ----
vi.mock("@/components/workspace/markdown-editor", () => ({
  MarkdownEditor: (props: {
    value?: string;
    onChange?: (value: string) => void;
    onExtractSection?: (section: { title: string; body: string; anchor: number }) => void;
  }) => (
    <div>
      <textarea
        aria-label="test-editor"
        value={props.value ?? ""}
        onChange={(event) => props.onChange?.(event.target.value)}
      />
      <button
        type="button"
        aria-label="test-extract"
        onClick={() => props.onExtractSection?.({ title: "Nota", body: "x", anchor: 2 })}
      />
    </div>
  ),
}));
vi.mock("@/components/workspace/markdown-preview", () => ({
  MarkdownPreview: (props: { content?: string; onChange?: (value: string) => void }) => (
    <textarea
      aria-label="test-preview"
      value={props.content ?? ""}
      onChange={(event) => props.onChange?.(event.target.value)}
    />
  ),
}));
vi.mock("@/components/workspace/editor-toolbar", () => ({ EditorToolbar: () => null }));
vi.mock("@/components/workspace/graph-view", () => ({ GraphView: () => null }));
vi.mock("@/components/workspace/canvas-view", () => ({ CanvasView: () => null }));
vi.mock("@/components/workspace/base-view", () => ({ BaseView: () => null }));
vi.mock("@/components/workspace/chat-panel", () => ({ ChatPanel: () => null }));
vi.mock("@/components/workspace/agent-panel", () => ({ AgentPanel: () => null }));
vi.mock("@/components/workspace/version-history", () => ({ VersionHistory: () => null }));
vi.mock("@/components/workspace/properties-editor", () => ({ PropertiesEditor: () => null }));
vi.mock("@/components/workspace/attachments-panel", () => ({ AttachmentsPanel: () => null }));
vi.mock("@/components/workspace/share-modal", () => ({ ShareModal: () => null }));
vi.mock("@/components/workspace/result-modal", () => ({ ResultModal: () => null }));
vi.mock("@/components/workspace/settings-modal", () => ({ SettingsModal: () => null }));
vi.mock("@/components/workspace/import-dialog", () => ({ ImportDialog: () => null }));
vi.mock("@/components/pwa-install", () => ({
  usePwaInstall: () => ({
    canInstall: false,
    installed: true,
    isIOS: false,
    promptInstall: async () => "dismissed",
  }),
  InstallHelpModal: () => null,
}));
vi.mock("@/components/ui/preferences-sync", () => ({ PreferencesSync: () => null }));

import { Workspace } from "@/components/workspace/workspace";

const vault: VaultAccess = {
  id: "v1",
  name: "Bóveda de prueba",
  slug: "boveda",
  role: "owner",
  settings: {},
};

const NOTE_DETAIL = {
  id: "n1",
  path: "Nota.md",
  title: "Nota",
  content: "# Nota\n\nTexto inicial\n",
  frontmatter: {},
  wordCount: 3,
  updatedAt: "2026-01-01T00:00:00Z",
  pinnedAt: null,
  backlinks: [],
  outgoing: [],
  tags: [],
  outline: [],
};

const TREE = {
  notes: [
    { id: "n1", path: "Nota.md", title: "Nota", pinnedAt: null },
    { id: "n2", path: "Carpetas/Otra.md", title: "Otra", pinnedAt: null },
  ],
  folders: ["Carpetas"],
  tags: [],
};

type Route = {
  method: string;
  pattern: RegExp;
  reply: (url: URL, body: string | null) => Response;
};

let routes: Route[] = [];
const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(input instanceof Request ? input.url : String(input), "http://localhost");
  const method = (init?.method ?? "GET").toUpperCase();
  const found = routes.find((candidate) => candidate.method === method && candidate.pattern.test(url.pathname));
  if (!found) return new Response(`sin ruta: ${method} ${url.pathname}`, { status: 500 });
  return found.reply(url, typeof init?.body === "string" ? init.body : null);
});

function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}

function route(method: string, pattern: RegExp, reply: Route["reply"]) {
  routes.push({ method, pattern, reply });
}

function defaultRoutes() {
  route("GET", /\/api\/v1\/vaults\/v1\/tree$/, () => json(TREE));
  route("GET", /\/api\/v1\/vaults\/v1\/canvases$/, () => json({ canvases: [] }));
  route("GET", /\/api\/v1\/vaults\/v1\/bases$/, () => json({ bases: [] }));
  route("GET", /\/api\/v1\/vaults\/v1\/notes\/n1$/, () => json({ note: NOTE_DETAIL }));
  route("POST", /\/api\/v1\/vaults\/v1\/notes\/n1\/open$/, () => json({ ok: true }));
}

async function openFirstNote() {
  await userEvent.click(screen.getByRole("button", { name: "Nota" }));
  await waitFor(() => {
    expect(screen.getByTitle("Mover a papelera")).toBeInTheDocument();
  });
}

/** Acepta el dialogo de confirmacion propio (reemplaza window.confirm). */
async function acceptDialog(label = "Mover") {
  await userEvent.click(await screen.findByRole("button", { name: label }));
}

/** Espera a que el árbol esté estable tras abrir una nota (loadTree re-monta las filas). */
async function settleTree() {
  await waitFor(() => {
    const treeFetches = fetchMock.mock.calls.filter(([target]) => String(target).endsWith("/tree"));
    expect(treeFetches.length).toBeGreaterThanOrEqual(2);
  });
  await new Promise((resolve) => setTimeout(resolve, 100));
}

beforeEach(async () => {
  routes = [];
  defaultRoutes();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(window, "confirm").mockReturnValue(true);
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
    }),
  });
  render(<Workspace vault={vault} />);
  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Nota" })).toBeInTheDocument();
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Workspace: papelera", () => {
  it("DELETE rechazado mantiene la nota abierta y muestra el error del servidor", async () => {
    const deleteHandler = vi.fn(() => json({ error: "Sin permisos" }, 403));
    route("DELETE", /\/api\/v1\/vaults\/v1\/notes\/n1$/, deleteHandler);

    await openFirstNote();
    await userEvent.click(screen.getByTitle("Mover a papelera"));
    await acceptDialog();

    expect(await screen.findByText("Sin permisos")).toBeInTheDocument();
    expect(screen.queryByText("Nota movida a la papelera")).not.toBeInTheDocument();
    expect(deleteHandler).toHaveBeenCalledTimes(1);
    expect(screen.getByTitle("Mover a papelera")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nota" })).toBeInTheDocument();
  });

  it("DELETE rechazado desde el menú del árbol conserva la nota", async () => {
    const deleteHandler = vi.fn(() => json({ error: "Sin permisos" }, 403));
    route("DELETE", /\/api\/v1\/vaults\/v1\/notes\/n1$/, deleteHandler);
    route("DELETE", /\/api\/v1\/vaults\/v1\/notes\/n2$/, deleteHandler);

    await userEvent.click(screen.getAllByLabelText("Acciones de la nota")[0]);
    await userEvent.click(await screen.findByText("Mover a papelera"));
    await acceptDialog();

    expect(await screen.findByText("Sin permisos")).toBeInTheDocument();
    expect(screen.queryByText("Nota movida a la papelera")).not.toBeInTheDocument();
    expect(screen.getAllByLabelText("Acciones de la nota")).toHaveLength(2);
    expect(deleteHandler).toHaveBeenCalledTimes(1);
  });

  it("DELETE aceptado mueve la nota y avisa", async () => {
    route("DELETE", /\/api\/v1\/vaults\/v1\/notes\/n1$/, () => json({ ok: true }));

    await openFirstNote();
    await userEvent.click(screen.getByTitle("Mover a papelera"));
    await acceptDialog();

    expect(await screen.findByText("Nota movida a la papelera")).toBeInTheDocument();
  });
});

describe("Workspace: mover nota", () => {
  it("aborta el movimiento cuando falla el guardado y no envía el PATCH de ruta", async () => {
    const patchCalls: Array<Record<string, unknown>> = [];
    route("PATCH", /\/api\/v1\/vaults\/v1\/notes\/n1$/, (_url, body) => {
      patchCalls.push(JSON.parse(body ?? "{}"));
      return json({ error: "conflicto de versión" }, 500);
    });

    await openFirstNote();
    await settleTree();
    const previewEditor = screen.getByLabelText("test-preview");
    await userEvent.type(previewEditor, "modificado");

    const folder = screen.getByText("Carpetas");
    fireEvent.drop(folder, { dataTransfer: { getData: () => "n1" } });

    expect(await screen.findByText("Guarda los cambios antes de mover la nota")).toBeInTheDocument();
    expect(patchCalls).toHaveLength(1);
    expect(patchCalls[0]).toHaveProperty("content");
    expect(patchCalls[0]).not.toHaveProperty("path");
    expect(screen.getByRole("button", { name: "Nota" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Otra" })).toBeInTheDocument();
  });

  it("mueve la nota al guardar sin cambios pendientes", async () => {
    const patchCalls: Array<Record<string, unknown>> = [];
    route("PATCH", /\/api\/v1\/vaults\/v1\/notes\/n1$/, (_url, body) => {
      patchCalls.push(JSON.parse(body ?? "{}"));
      return json({ note: { ...NOTE_DETAIL, path: "Carpetas/Nota.md" } });
    });

    await openFirstNote();
    await settleTree();
    const folder = screen.getByText("Carpetas");
    fireEvent.drop(folder, { dataTransfer: { getData: () => "n1" } });

    await screen.findByText("Nota movida a Carpetas");
    expect(patchCalls).toHaveLength(1);
    expect(patchCalls[0]).toEqual({ path: "Carpetas/Nota.md" });
    expect(screen.getByRole("button", { name: "Nota" })).toBeInTheDocument();
  });
});

describe("Workspace: extraer sección", () => {
  async function openInEditMode() {
    await openFirstNote();
    await userEvent.click(screen.getByTitle("Documento Markdown completo"));
    await waitFor(() => {
      expect(screen.getByLabelText("test-extract")).toBeInTheDocument();
    });
  }

  it("no toca el original si falla la creación de la nota extraída", async () => {
    route("POST", /\/api\/v1\/vaults\/v1\/notes$/, () => json({ error: "ruta duplicada" }, 500));

    await openInEditMode();
    await userEvent.click(screen.getByLabelText("test-extract"));

    expect(await screen.findByText("ruta duplicada")).toBeInTheDocument();
    expect(screen.queryByText(/Sección extraída a/)).not.toBeInTheDocument();
    const patches = fetchMock.mock.calls.filter(
      ([target, options]) =>
        String(target).endsWith("/notes/n1") &&
        (options as RequestInit | undefined)?.method === "PATCH",
    );
    expect(patches).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Nota" })).toBeInTheDocument();
  });

  it("si falla el guardado posterior, avisa y no anuncia éxito", async () => {
    route("POST", /\/api\/v1\/vaults\/v1\/notes$/, () =>
      json({ note: { id: "n3", path: "Nota 2.md" } }),
    );
    route("PATCH", /\/api\/v1\/vaults\/v1\/notes\/n1$/, () => json({ error: "conflicto" }, 500));

    await openInEditMode();
    await userEvent.click(screen.getByLabelText("test-extract"));

    expect(
      await screen.findByText("La nota se creó, pero no se pudo quitar la sección del original"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Sección extraída a/)).not.toBeInTheDocument();
    expect(screen.getByTitle("Mover a papelera")).toBeInTheDocument();
  });

  it("extracción completa abre la nota nueva y anuncia éxito", async () => {
    route("POST", /\/api\/v1\/vaults\/v1\/notes$/, () =>
      json({ note: { id: "n3", path: "Nota 2.md" } }),
    );
    route("PATCH", /\/api\/v1\/vaults\/v1\/notes\/n1$/, () => json({ note: NOTE_DETAIL }));
    route(
      "GET",
      /\/api\/v1\/vaults\/v1\/notes\/n3$/,
      () => json({ note: { ...NOTE_DETAIL, id: "n3", path: "Nota 2.md", title: "Nota 2" } }),
    );
    route("POST", /\/api\/v1\/vaults\/v1\/notes\/n3\/open$/, () => json({ ok: true }));

    await openInEditMode();
    await userEvent.click(screen.getByLabelText("test-extract"));

    expect(await screen.findByText("Sección extraída a Nota 2.md")).toBeInTheDocument();
    expect(screen.getByTitle("Mover a papelera")).toBeInTheDocument();
  });
});
