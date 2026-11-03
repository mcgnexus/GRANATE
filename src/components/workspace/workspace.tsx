"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  FilePlus2,
  History,
  Loader2,
  Menu,
  MessageSquare,
  MoreHorizontal,
  Network,
  PanelLeftClose,
  PencilLine,
  Save,
  Search,
  Settings,
  Sparkles,
  Trash2,
  Upload,
  Eye,
} from "lucide-react";
import { FileTree, type TreeBase, type TreeCanvas, type TreeNote } from "./file-tree";
import { MarkdownEditor, type MarkdownEditorHandle } from "./markdown-editor";
import { EditorToolbar } from "./editor-toolbar";
import { MarkdownPreview } from "./markdown-preview";
import { SearchDialog } from "./search-dialog";
import { GraphView } from "./graph-view";
import { ChatPanel } from "./chat-panel";
import { CanvasView } from "./canvas-view";
import { BaseView } from "./base-view";
import { SettingsModal } from "./settings-modal";
import { ImportDialog } from "./import-dialog";
import { ResultModal } from "./result-modal";
import { Modal } from "@/components/ui/modal";
import { ACTION_LABELS, type NoteAction } from "@/lib/ai/actions";
import type { VaultAccess } from "@/lib/auth/api";

type NoteDetail = {
  id: string;
  path: string;
  title: string;
  content: string;
  frontmatter: Record<string, unknown>;
  wordCount: number;
  updatedAt: string;
  backlinks: Array<{ id: string; path: string; title: string }>;
  outgoing: Array<{ targetPath: string | null; targetId: string | null; rawTarget: string }>;
  tags: string[];
  outline: Array<{ level: number; text: string; line: number }>;
};

type TreeData = {
  notes: TreeNote[];
  folders: string[];
  tags: Array<{ name: string; count: number }>;
};

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

export function Workspace({ vault }: { vault: VaultAccess }) {
  const [tree, setTree] = useState<TreeData>({ notes: [], folders: [], tags: [] });
  const [canvases, setCanvases] = useState<TreeCanvas[]>([]);
  const [bases, setBases] = useState<TreeBase[]>([]);
  const [active, setActive] = useState<NoteDetail | null>(null);
  const [content, setContent] = useState("");
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [view, setView] = useState<"note" | "canvas" | "base">("note");
  const [canvasTarget, setCanvasTarget] = useState<TreeCanvas | null>(null);
  const [baseTarget, setBaseTarget] = useState<TreeBase | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [rightTab, setRightTab] = useState<"details" | "ai">("details");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchSeed, setSearchSeed] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [graphOpen, setGraphOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [newNoteOpen, setNewNoteOpen] = useState(false);
  const [newNotePath, setNewNotePath] = useState("Nueva nota.md");
  const [llmResult, setLlmResult] = useState<{
    title: string;
    result: string;
    original?: string;
    apply?: boolean;
  } | null>(null);
  const [llmLoading, setLlmLoading] = useState<NoteAction | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [versions, setVersions] = useState<
    Array<{ id: string; source: string; createdAt: string }>
  >([]);
  const [toast, setToast] = useState("");

  const latest = useRef({ content, activeId: active?.id, activeContent: active?.content });
  latest.current = { content, activeId: active?.id, activeContent: active?.content };
  const saveTimer = useRef<number | undefined>(undefined);
  const editorRef = useRef<MarkdownEditorHandle>(null);

  const canWrite = vault.role !== "viewer";

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }, []);

  const loadTree = useCallback(async () => {
    const [treeResponse, canvasResponse, baseResponse] = await Promise.all([
      fetch(`/api/v1/vaults/${vault.id}/tree`),
      fetch(`/api/v1/vaults/${vault.id}/canvases`),
      fetch(`/api/v1/vaults/${vault.id}/bases`),
    ]);
    if (treeResponse.ok) {
      const data = (await treeResponse.json()) as TreeData;
      setTree({
        notes: data.notes ?? [],
        folders: data.folders ?? [],
        tags: data.tags ?? [],
      });
    }
    if (canvasResponse.ok) {
      const data = (await canvasResponse.json()) as { canvases: TreeCanvas[] };
      setCanvases(data.canvases ?? []);
    }
    if (baseResponse.ok) {
      const data = (await baseResponse.json()) as { bases: TreeBase[] };
      setBases(data.bases ?? []);
    }
  }, [vault.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial desde la API
    void loadTree();
  }, [loadTree]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveNow();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openNote(note: TreeNote) {
    const response = await fetch(`/api/v1/vaults/${vault.id}/notes/${note.id}`);
    if (!response.ok) {
      showToast("No se pudo abrir la nota");
      return;
    }
    const data = (await response.json()) as { note: NoteDetail };
    const detail: NoteDetail = {
      ...data.note,
      backlinks: data.note.backlinks ?? [],
      outgoing: data.note.outgoing ?? [],
      tags: data.note.tags ?? [],
      outline: data.note.outline ?? [],
      frontmatter: data.note.frontmatter ?? {},
      content: data.note.content ?? "",
    };
    setActive(detail);
    setContent(detail.content);
    setView("note");
    setMode("edit");
    setSaveState("idle");
    setSidebarOpen(false);
  }

  async function openByPath(path: string) {
    const target = path.endsWith(".md") ? path : `${path}.md`;
    const response = await fetch(
      `/api/v1/vaults/${vault.id}/notes?path=${encodeURIComponent(target)}`,
    );
    if (response.ok) {
      const data = (await response.json()) as { note: { id: string; path: string } };
      await openNote({ id: data.note.id, path: data.note.path, title: data.note.path });
      return;
    }

    if (path.toLowerCase().endsWith(".canvas")) {
      setCanvasTarget({ id: "", path });
      setView("canvas");
      return;
    }
    if (path.toLowerCase().endsWith(".base")) {
      setBaseTarget({ id: "", path });
      setView("base");
      return;
    }

    if (!canWrite) {
      showToast("La nota no existe y no tienes permisos de escritura");
      return;
    }

    const create = await fetch(`/api/v1/vaults/${vault.id}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: target, content: `# ${path.split("/").pop()}\n\n` }),
    });
    if (create.ok) {
      const data = (await create.json()) as { note: { id: string; path: string } };
      await loadTree();
      await openNote({ id: data.note.id, path: data.note.path, title: data.note.path });
    } else {
      showToast("No se pudo crear la nota enlazada");
    }
  }

  async function saveNow(explicit?: string) {
    const noteId = latest.current.activeId;
    if (!noteId) return;
    const value = explicit ?? latest.current.content;
    if (explicit === undefined && value === latest.current.activeContent) return;
    window.clearTimeout(saveTimer.current);
    setSaveState("saving");
    try {
      const response = await fetch(`/api/v1/vaults/${vault.id}/notes/${noteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: value }),
      });
      if (!response.ok) throw new Error("save failed");
      const data = (await response.json()) as { note: NoteDetail };
      setActive(data.note);
      setSaveState("saved");
      void loadTree();
      window.setTimeout(() => {
        setSaveState((current) => (current === "saved" ? "idle" : current));
      }, 1800);
    } catch {
      setSaveState("error");
    }
  }

  useEffect(() => {
    if (!active) return;
    if (content === active.content) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- marca cambios locales para el autosave
    setSaveState("dirty");
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void saveNow();
    }, 1300);
    return () => window.clearTimeout(saveTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, active?.id]);

  async function createNote() {
    const path = newNotePath.trim();
    if (!path) return;
    const response = await fetch(`/api/v1/vaults/${vault.id}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: path.endsWith(".md") ? path : `${path}.md`,
        content: `# ${path.split("/").pop()?.replace(/\.md$/, "")}\n\n`,
      }),
    });
    const data = (await response.json()) as {
      note?: { id: string; path: string };
      error?: string;
    };
    if (!response.ok || !data.note) {
      showToast(data.error ?? "No se pudo crear la nota");
      return;
    }
    setNewNoteOpen(false);
    setNewNotePath("Nueva nota.md");
    await loadTree();
    await openNote({ id: data.note.id, path: data.note.path, title: data.note.path });
  }

  async function renameActive() {
    if (!active || !canWrite) return;
    const next = window.prompt("Nueva ruta de la nota", active.path);
    if (!next || next === active.path) return;
    const response = await fetch(`/api/v1/vaults/${vault.id}/notes/${active.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: next }),
    });
    if (!response.ok) {
      showToast("No se pudo renombrar (¿ruta duplicada?)");
      return;
    }
    const data = (await response.json()) as { note: NoteDetail };
    setActive(data.note);
    await loadTree();
    showToast("Nota renombrada y enlaces actualizados");
  }

  async function deleteActive() {
    if (!active || !canWrite) return;
    if (!window.confirm(`¿Mover «${active.title}» a la papelera?`)) return;
    await fetch(`/api/v1/vaults/${vault.id}/notes/${active.id}`, { method: "DELETE" });
    setActive(null);
    setContent("");
    await loadTree();
    showToast("Nota movida a la papelera");
  }

  async function runAction(action: NoteAction) {
    if (!active) return;
    setLlmLoading(action);
    try {
      const response = await fetch(`/api/v1/vaults/${vault.id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noteId: active.id, action }),
      });
      const data = (await response.json()) as { result?: string; error?: string };
      if (!response.ok || !data.result) {
        showToast(data.error ?? "El LLM no está disponible");
        return;
      }
      setLlmResult({
        title: ACTION_LABELS[action],
        result: data.result,
        original: action === "review" || action === "structure" ? content : undefined,
        apply: action === "review" || action === "structure",
      });
    } catch {
      showToast("Error al llamar al LLM");
    } finally {
      setLlmLoading(null);
    }
  }

  async function createCanvas() {
    const path = window.prompt("Ruta del nuevo canvas", `Canvas ${new Date().toISOString().slice(0, 10)}.canvas`);
    if (!path) return;
    const finalPath = path.endsWith(".canvas") ? path : `${path}.canvas`;
    const response = await fetch(`/api/v1/vaults/${vault.id}/canvases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: finalPath, data: { nodes: [], edges: [] } }),
    });
    const data = (await response.json()) as { canvas?: { id: string; path: string } };
    if (data.canvas) {
      await loadTree();
      setCanvasTarget({ id: data.canvas.id, path: data.canvas.path });
      setView("canvas");
    }
  }

  async function createBase() {
    const path = window.prompt("Ruta de la nueva base", "Proyectos.base");
    if (!path) return;
    const finalPath = path.endsWith(".base") ? path : `${path}.base`;
    const raw = `filters: ''
views:
  - type: table
    name: Todas
    order: [file.name, note.status]
`;
    const response = await fetch(`/api/v1/vaults/${vault.id}/bases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: finalPath, raw }),
    });
    if (!response.ok) {
      showToast("No se pudo crear la base");
      return;
    }
    await loadTree();
    setBaseTarget({ id: "", path: finalPath });
    setView("base");
  }

  async function openHistory() {
    if (!active) return;
    setHistoryOpen(true);
    const response = await fetch(`/api/v1/vaults/${vault.id}/notes/${active.id}/versions`);
    if (!response.ok) return;
    const data = (await response.json()) as {
      versions: Array<{ id: string; source: string; createdAt: string }>;
    };
    setVersions(data.versions);
  }

  async function restoreVersion(versionId: string) {
    if (!active) return;
    await fetch(`/api/v1/vaults/${vault.id}/notes/${active.id}/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ versionId }),
    });
    setHistoryOpen(false);
    await openNote({ id: active.id, path: active.path, title: active.title });
    showToast("Versión restaurada");
  }

  const activeTags = active?.tags ?? [];

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="relative flex h-12 shrink-0 items-center gap-2 border-b border-[var(--border)] bg-[var(--panel)] px-2 sm:px-3">
        <button
          type="button"
          className="btn btn-ghost h-8 w-8 shrink-0 p-0 lg:hidden"
          onClick={() => setSidebarOpen((open) => !open)}
          title="Abrir menú"
        >
          <Menu size={16} />
        </button>
        <div className="flex shrink-0 items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-[var(--accent)] text-[11px] font-bold text-white">
            G
          </span>
          <div className="hidden sm:block">
            <div className="max-w-[160px] truncate text-xs font-medium leading-tight">{vault.name}</div>
            <div className="text-[10px] leading-tight text-[var(--muted)]">
              {vault.role === "owner" ? "propietario" : vault.role}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="btn btn-ghost ml-1 h-8 w-8 shrink-0 p-0 sm:hidden"
          title="Buscar"
          aria-label="Buscar"
        >
          <Search size={16} />
        </button>

        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="ml-2 hidden h-8 min-w-0 max-w-md flex-1 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 text-left text-xs text-[var(--muted)] hover:border-[var(--muted)] sm:flex"
        >
          <Search size={14} />
          <span className="flex-1 truncate">Buscar en la bóveda…</span>
          <span className="kbd hidden md:inline">Ctrl K</span>
        </button>

        <div className="ml-auto flex shrink-0 items-center gap-1">
          <div className="hidden items-center gap-1 sm:flex">
            <button
              type="button"
              onClick={() => {
                setView("note");
                setGraphOpen(true);
              }}
              className="btn btn-ghost h-8 gap-1.5 px-2 text-xs"
              title="Grafo"
            >
              <Network size={15} /> <span className="hidden md:inline">Grafo</span>
            </button>
            <button
              type="button"
              onClick={() => setChatOpen((open) => !open)}
              className={`btn btn-ghost h-8 gap-1.5 px-2 text-xs ${chatOpen ? "bg-[var(--accent-soft)]" : ""}`}
              title="Preguntar a la bóveda"
            >
              <MessageSquare size={15} /> <span className="hidden md:inline">Preguntar</span>
            </button>
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="btn btn-ghost h-8 gap-1.5 px-2 text-xs"
              title="Importar bóveda"
            >
              <Upload size={15} /> <span className="hidden lg:inline">Importar</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="btn h-8 w-8 shrink-0 bg-[var(--panel-2)] p-0"
            title="Ajustes"
            aria-label="Ajustes"
          >
            <Settings size={16} />
          </button>

          <button
            type="button"
            onClick={() => setMobileMenuOpen((open) => !open)}
            className="btn btn-ghost h-8 w-8 shrink-0 p-0 sm:hidden"
            title="Más acciones"
            aria-label="Más acciones"
            aria-expanded={mobileMenuOpen}
          >
            <MoreHorizontal size={16} />
          </button>
        </div>

        {mobileMenuOpen ? (
          <>
            <button
              type="button"
              aria-label="Cerrar menú"
              className="fixed inset-0 z-30 bg-black/20 sm:hidden"
              onClick={() => setMobileMenuOpen(false)}
            />
            <div className="panel absolute right-2 top-11 z-40 w-56 overflow-hidden p-1 shadow-2xl sm:hidden">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setView("note");
                  setGraphOpen(true);
                }}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs hover:bg-[var(--panel-2)]"
              >
                <Network size={14} /> Grafo
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setChatOpen(true);
                }}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs hover:bg-[var(--panel-2)]"
              >
                <MessageSquare size={14} /> Preguntar a la bóveda
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setImportOpen(true);
                }}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs hover:bg-[var(--panel-2)]"
              >
                <Upload size={14} /> Importar bóveda
              </button>
            </div>
          </>
        ) : null}
      </header>

      <div className="flex min-h-0 flex-1">
        <aside
          className={`${
            sidebarOpen ? "absolute inset-y-12 left-0 z-30 w-72 shadow-2xl" : "hidden"
          } shrink-0 border-r border-[var(--border)] bg-[var(--panel)] lg:block lg:w-[262px]`}
        >
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between px-3 py-2 lg:hidden">
              <span className="text-xs text-[var(--muted)]">Bóveda</span>
              <button
                type="button"
                className="btn btn-ghost h-7 w-7 p-0"
                onClick={() => setSidebarOpen(false)}
              >
                <PanelLeftClose size={15} />
              </button>
            </div>
            <FileTree
              notes={tree.notes}
              folders={tree.folders}
              canvases={canvases}
              bases={bases}
              activeId={active?.id}
              onOpen={openNote}
              onNewNote={() => {
                setNewNotePath("Nueva nota.md");
                setNewNoteOpen(true);
              }}
              onOpenCanvas={(canvas) => {
                setCanvasTarget(canvas);
                setView("canvas");
                setSidebarOpen(false);
              }}
              onOpenBase={(base) => {
                setBaseTarget(base);
                setView("base");
                setSidebarOpen(false);
              }}
              onNewCanvas={createCanvas}
              onNewBase={createBase}
            />

            {(tree.tags?.length ?? 0) > 0 ? (
              <div className="border-t border-[var(--border)] p-3">
                <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">
                  Etiquetas
                </div>
                <div className="flex max-h-28 flex-wrap gap-1 overflow-y-auto">
                  {tree.tags.slice(0, 24).map((tag) => (
                    <button
                      key={tag.name}
                      type="button"
                      onClick={() => {
                        setSearchSeed(tag.name);
                        setSearchOpen(true);
                      }}
                      className="chip hover:border-[var(--accent)]"
                    >
                      #{tag.name} <span className="text-[var(--muted)]">{tag.count}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </aside>

        {sidebarOpen ? (
          <button
            type="button"
            aria-label="Cerrar menú"
            className="absolute inset-0 z-20 bg-black/40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        ) : null}

        <main className="flex min-w-0 flex-1 flex-col bg-[var(--bg)]">
          {view === "canvas" && canvasTarget ? (
            <CanvasView
              vaultId={vault.id}
              canvasId={canvasTarget.id || undefined}
              canvasPath={canvasTarget.path || undefined}
              onSaved={() => void loadTree()}
            />
          ) : view === "base" && baseTarget ? (
            <BaseView vaultId={vault.id} basePath={baseTarget.path} onOpenNote={openByPath} />
          ) : active ? (
            <>
              <div className="flex h-10 shrink-0 items-center gap-2 border-b border-[var(--border)] px-3">
                <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-[var(--muted)]">
                  <span className="hidden truncate sm:inline">{active.path.split("/").slice(0, -1).join(" / ")}</span>
                  {active.path.includes("/") ? <span className="hidden sm:inline">/</span> : null}
                  <span className="truncate text-[var(--text-soft)]">{active.title}</span>
                </div>

                <div className="ml-auto flex items-center gap-1">
                  <span className="mr-1 hidden items-center gap-1 text-[10px] text-[var(--muted)] sm:flex">
                    {saveState === "saving" ? <Loader2 size={11} className="animate-spin" /> : null}
                    {saveState === "saved" ? <Check size={11} className="text-[var(--green)]" /> : null}
                    {saveState === "error" ? <AlertCircle size={11} className="text-[var(--accent-2)]" /> : null}
                    {saveState === "dirty"
                      ? "sin guardar"
                      : saveState === "saving"
                        ? "guardando…"
                        : saveState === "saved"
                          ? "guardado"
                          : saveState === "error"
                            ? "error"
                            : "guardado"}
                  </span>
                  <button
                    type="button"
                    onClick={() => setMode("edit")}
                    className={`btn h-7 px-2 text-[11px] ${mode === "edit" ? "bg-[var(--accent-soft)]" : "btn-ghost"}`}
                  >
                    <PencilLine size={12} /> Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("preview")}
                    className={`btn h-7 px-2 text-[11px] ${mode === "preview" ? "bg-[var(--accent-soft)]" : "btn-ghost"}`}
                  >
                    <Eye size={12} /> Ver
                  </button>
                  <button type="button" onClick={() => void saveNow()} className="btn btn-ghost h-7 w-7 p-0" title="Guardar (Ctrl+S)">
                    <Save size={13} />
                  </button>
                  <button type="button" onClick={renameActive} className="btn btn-ghost h-7 w-7 p-0" title="Renombrar">
                    <PencilLine size={13} />
                  </button>
                  <button type="button" onClick={openHistory} className="btn btn-ghost h-7 w-7 p-0" title="Historial">
                    <History size={13} />
                  </button>
                  <button type="button" onClick={deleteActive} className="btn btn-ghost h-7 w-7 p-0 text-[var(--accent-2)]" title="Mover a papelera">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              <div className="flex min-h-0 flex-1 flex-col">
                {mode === "edit" ? (
                  <>
                    {canWrite ? (
                      <EditorToolbar
                        editorRef={editorRef}
                        vaultId={vault.id}
                        notes={tree.notes}
                        tags={tree.tags}
                        activeNoteId={active.id}
                        onToast={showToast}
                      />
                    ) : null}
                    <div className="min-h-0 flex-1">
                      <MarkdownEditor
                        ref={editorRef}
                        value={content}
                        onChange={setContent}
                        readOnly={!canWrite}
                        onSave={() => void saveNow()}
                      />
                    </div>
                  </>
                ) : (
                  <div className="scrollbar h-full overflow-y-auto">
                    <MarkdownPreview content={content} vaultId={vault.id} onOpenNote={openByPath} />
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center p-8">
              <div className="max-w-md text-center">
                <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[var(--accent-soft)] text-2xl">
                  ✦
                </div>
                <h2 className="font-display mt-4 text-2xl">Tu bóveda está lista</h2>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                  Elige una nota del árbol, crea una nueva o importa tu bóveda de Obsidian.
                  También puedes preguntarle al LLM qué tienes guardado.
                </p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  <button type="button" className="btn btn-primary text-xs" onClick={() => setNewNoteOpen(true)}>
                    <FilePlus2 size={14} /> Nueva nota
                  </button>
                  <button type="button" className="btn text-xs" onClick={() => setImportOpen(true)}>
                    <Upload size={14} /> Importar ZIP
                  </button>
                </div>
              </div>
            </div>
          )}

          <footer className="flex h-7 shrink-0 items-center gap-3 border-t border-[var(--border)] bg-[var(--panel)] px-3 text-[10px] text-[var(--muted)]">
            <span>{tree.notes?.length ?? 0} notas</span>
            <span>{tree.tags?.length ?? 0} etiquetas</span>
            <span className="ml-auto flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--green)]" /> Neon
            </span>
          </footer>
        </main>

        {chatOpen ? (
          <aside className="fixed inset-y-12 right-0 z-30 w-full max-w-[420px] border-l border-[var(--border)] bg-[var(--panel)] shadow-2xl lg:static lg:inset-auto lg:z-auto lg:w-[380px] lg:shadow-none">
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2 lg:hidden">
                <span className="text-xs">Asistente</span>
                <button type="button" className="btn btn-ghost h-7 w-7 p-0" onClick={() => setChatOpen(false)}>
                  ✕
                </button>
              </div>
              <div className="min-h-0 flex-1">
                <ChatPanel
                  vaultId={vault.id}
                  onOpenNote={(path) => {
                    void openByPath(path);
                    setChatOpen(false);
                  }}
                />
              </div>
            </div>
          </aside>
        ) : active ? (
          <aside className="hidden w-[286px] shrink-0 border-l border-[var(--border)] bg-[var(--panel)] xl:block">
            <div className="flex h-full flex-col">
              <div className="flex border-b border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setRightTab("details")}
                  className={`flex-1 px-3 py-2 text-[11px] ${rightTab === "details" ? "border-b-2 border-[var(--accent)] text-[var(--text)]" : "text-[var(--muted)]"}`}
                >
                  Detalles
                </button>
                <button
                  type="button"
                  onClick={() => setRightTab("ai")}
                  className={`flex-1 px-3 py-2 text-[11px] ${rightTab === "ai" ? "border-b-2 border-[var(--accent)] text-[var(--text)]" : "text-[var(--muted)]"}`}
                >
                  IA
                </button>
              </div>

              <div className="scrollbar min-h-0 flex-1 space-y-5 overflow-y-auto p-4 text-xs">
                {rightTab === "details" ? (
                  <>
                    <section>
                      <h3 className="mb-2 text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">
                        Propiedades
                      </h3>
                      {Object.entries(active.frontmatter ?? {}).length === 0 ? (
                        <p className="text-[11px] text-[var(--muted)]">Sin frontmatter.</p>
                      ) : (
                        <dl className="space-y-1.5">
                          {Object.entries(active.frontmatter ?? {}).map(([key, value]) => (
                            <div key={key} className="flex gap-2">
                              <dt className="w-20 shrink-0 truncate text-[var(--muted)]">{key}</dt>
                              <dd className="min-w-0 flex-1 break-words text-[var(--text-soft)]">
                                {Array.isArray(value) ? value.join(", ") : String(value)}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      )}
                    </section>

                    <section>
                      <h3 className="mb-2 text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">
                        Etiquetas
                      </h3>
                      <div className="flex flex-wrap gap-1">
                        {activeTags.length ? (
                          activeTags.map((tag) => (
                            <span key={tag} className="chip">#{tag}</span>
                          ))
                        ) : (
                          <span className="text-[11px] text-[var(--muted)]">Sin etiquetas.</span>
                        )}
                      </div>
                    </section>

                    <section>
                      <h3 className="mb-2 text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">
                        Backlinks · {active.backlinks?.length ?? 0}
                      </h3>
                      <div className="space-y-1">
                        {active.backlinks?.map((backlink) => (
                          <button
                            key={backlink.id}
                            type="button"
                            onClick={() => void openNote(backlink)}
                            className="block w-full truncate rounded px-1.5 py-1 text-left text-[11px] text-[var(--accent-2)] hover:bg-[var(--panel-2)]"
                          >
                            {backlink.title}
                          </button>
                        ))}
                        {(active.backlinks?.length ?? 0) === 0 ? (
                          <p className="text-[11px] text-[var(--muted)]">Ninguna nota la enlaza.</p>
                        ) : null}
                      </div>
                    </section>

                    <section>
                      <h3 className="mb-2 text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">
                        Enlaces salientes · {active.outgoing?.length ?? 0}
                      </h3>
                      <div className="space-y-1">
                        {(active.outgoing ?? []).map((link, index) => (
                          <button
                            key={`${link.rawTarget}-${index}`}
                            type="button"
                            onClick={() => void openByPath(link.targetPath ?? link.rawTarget)}
                            className="block w-full truncate rounded px-1.5 py-1 text-left text-[11px] text-[var(--text-soft)] hover:bg-[var(--panel-2)]"
                          >
                            {link.rawTarget}
                          </button>
                        ))}
                        {(active.outgoing?.length ?? 0) === 0 ? (
                          <p className="text-[11px] text-[var(--muted)]">Sin enlaces salientes.</p>
                        ) : null}
                      </div>
                    </section>

                    <section>
                      <h3 className="mb-2 text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">
                        Índice
                      </h3>
                      <div className="space-y-0.5">
                        {(active.outline ?? []).map((item, index) => (
                          <div
                            key={index}
                            className="truncate text-[11px] text-[var(--text-soft)]"
                            style={{ paddingLeft: `${(item.level - 1) * 8}px` }}
                          >
                            {item.text}
                          </div>
                        ))}
                        {(active.outline?.length ?? 0) === 0 ? (
                          <p className="text-[11px] text-[var(--muted)]">Sin encabezados.</p>
                        ) : null}
                      </div>
                    </section>
                  </>
                ) : (
                  <>
                    <p className="text-[11px] leading-5 text-[var(--muted)]">
                      Acciones sobre esta nota. Revisar y reorganizar muestran un diff antes de
                      tocar el contenido.
                    </p>
                    <div className="space-y-2">
                      {(Object.keys(ACTION_LABELS) as NoteAction[]).map((action) => (
                        <button
                          key={action}
                          type="button"
                          disabled={Boolean(llmLoading) || !canWrite}
                          onClick={() => void runAction(action)}
                          className="btn w-full justify-start text-[11px]"
                        >
                          {llmLoading === action ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <Sparkles size={13} className="text-[var(--gold)]" />
                          )}
                          {ACTION_LABELS[action]}
                        </button>
                      ))}
                    </div>
                    <p className="text-[10px] leading-5 text-[var(--muted)]">
                      Modelo: Gemini 2.5 Flash vía OpenRouter. Cuota diaria activa. Las notas se
                      tratan como datos, nunca como instrucciones.
                    </p>
                  </>
                )}
              </div>
            </div>
          </aside>
        ) : null}
      </div>

      <SearchDialog
        key={searchSeed}
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        vaultId={vault.id}
        initialQuery={searchSeed}
        onOpenNote={openByPath}
      />

      <Modal open={graphOpen} onClose={() => setGraphOpen(false)} title="Grafo de la bóveda" full>
        <div className="h-full">
          <GraphView
            vaultId={vault.id}
            onOpenNote={(path) => {
              setGraphOpen(false);
              void openByPath(path);
            }}
          />
        </div>
      </Modal>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        vaultId={vault.id}
        vaultName={vault.name}
        canWrite={canWrite}
        onChanged={() => void loadTree()}
      />

      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        vaultId={vault.id}
        onImported={() => void loadTree()}
      />

      <Modal open={newNoteOpen} onClose={() => setNewNoteOpen(false)} title="Nueva nota" subtitle="Ruta dentro de la bóveda">
        <div className="space-y-4 p-5">
          <input
            className="input"
            value={newNotePath}
            onChange={(event) => setNewNotePath(event.target.value)}
            placeholder="Carpeta/Nota.md"
            autoFocus
            onKeyDown={(event) => {
              if (event.key === "Enter") void createNote();
            }}
          />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn" onClick={() => setNewNoteOpen(false)}>
              Cancelar
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void createNote()}>
              Crear
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        title="Historial de versiones"
        subtitle={active?.path}
      >
        <div className="divide-y divide-[var(--border-soft)]">
          {versions?.length === 0 ? (
            <p className="p-5 text-xs text-[var(--muted)]">Sin versiones todavía.</p>
          ) : (
            versions.map((version) => (
              <div key={version.id} className="flex items-center gap-3 px-5 py-3 text-xs">
                <div className="min-w-0 flex-1">
                  <div className="text-[var(--text-soft)]">
                    {new Date(version.createdAt).toLocaleString("es-ES")}
                  </div>
                  <div className="text-[10px] text-[var(--muted)]">{version.source}</div>
                </div>
                <button
                  type="button"
                  className="btn h-7 text-[11px]"
                  onClick={() => void restoreVersion(version.id)}
                >
                  Restaurar
                </button>
              </div>
            ))
          )}
        </div>
      </Modal>

      <ResultModal
        open={Boolean(llmResult)}
        onClose={() => setLlmResult(null)}
        title={llmResult?.title ?? ""}
        original={llmResult?.original}
        result={llmResult?.result ?? ""}
        onApply={
          llmResult?.apply
            ? () => {
                const next = llmResult.result;
                setContent(next);
                void saveNow(next);
              }
            : undefined
        }
      />

      {toast ? (
        <div className="fixed bottom-5 left-1/2 z-[60] -translate-x-1/2 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-4 py-2 text-xs shadow-xl">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
