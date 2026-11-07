"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CalendarDays,
  Check,
  Download,
  FilePlus2,
  History,
  Loader2,
  Menu,
  MessageSquare,
  MoreHorizontal,
  Network,
  PanelLeftClose,
  PanelRightOpen,
  PencilLine,
  Save,
  Search,
  Settings,
  Share2,
  Sparkles,
  Trash2,
  Upload,
  Eye } from "lucide-react";
import { FileTree, type TreeBase, type TreeCanvas, type TreeNote, type TreeSmartViews } from "./file-tree";
import { FolderPicker } from "./folder-picker";
import { MarkdownEditor, type MarkdownEditorHandle } from "./markdown-editor";
import { EditorToolbar } from "./editor-toolbar";
import { MarkdownPreview } from "./markdown-preview";
import { SearchDialog } from "./search-dialog";
import { NoteComposer } from "./note-composer";
import { TasksPanel } from "./tasks-panel";
import { PropertiesPanel } from "./properties-panel";
import { TagsPanel } from "./tags-panel";
import { QuickSwitcher } from "./quick-switcher";
import { CommandPalette, type CommandEntry } from "./command-palette";
import { GraphView } from "./graph-view";
import { ChatPanel } from "./chat-panel";
import { AgentPanel } from "./agent-panel";
import { CanvasView } from "./canvas-view";
import { BaseView } from "./base-view";
import { SettingsModal } from "./settings-modal";
import { ImportDialog } from "./import-dialog";
import { ResultModal } from "./result-modal";
import { VersionHistory } from "./version-history";
import { PropertiesEditor } from "./properties-editor";
import { AttachmentsPanel } from "./attachments-panel";
import { ShareModal } from "./share-modal";
import { PreferencesSync } from "@/components/ui/preferences-sync";
import { Modal } from "@/components/ui/modal";
import { InstallHelpModal, usePwaInstall } from "@/components/pwa-install";
import { ACTION_LABELS, type NoteAction } from "@/lib/ai/actions";
import type { VaultAccess } from "@/lib/auth/api";
import { findHeadingSection, removeSection, suggestNoteName } from "@/lib/markdown/formatting";
import { cacheNote, getCachedNote, listCachedNotes, isOnline } from "@/lib/offline-cache";
import { renderTemplate, todayPath, vaultTemplateSettings } from "@/lib/templates";

type NoteDetail = {
  id: string;
  path: string;
  title: string;
  content: string;
  frontmatter: Record<string, unknown>;
  wordCount: number;
  updatedAt: string;
  pinnedAt?: string | null;
  backlinks: Array<{ id: string; path: string; title: string }>;
  outgoing: Array<{ targetPath: string | null; targetId: string | null; rawTarget: string }>;
  tags: string[];
  outline: Array<{ level: number; text: string; line: number }>;
  unlinkedMentions: Array<{ id: string; path: string; title: string; snippet: string }>;
};

type TreeData = {
  notes: TreeNote[];
  folders: string[];
  tags: Array<{ name: string; count: number }>;
  views?: TreeSmartViews;
};

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

export function Workspace({ vault }: { vault: VaultAccess }) {
  const [tree, setTree] = useState<TreeData>({ notes: [], folders: [], tags: [] });
  const [canvases, setCanvases] = useState<TreeCanvas[]>([]);
  const [bases, setBases] = useState<TreeBase[]>([]);
  const [active, setActive] = useState<NoteDetail | null>(null);
  const [content, setContent] = useState("");
  const loadLayoutPref = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const [mode, setMode] = useState<"edit" | "preview">(() => {
  const stored = typeof window === "undefined" ? null : loadLayoutPref("granate.mode");
  return stored === "edit" || stored === "preview" ? stored : "preview";
});
  const [vimMode, setVimMode] = useState(() => (typeof window !== "undefined" && window.localStorage.getItem("granate.vimMode") === "1"));
  const [view, setView] = useState<"note" | "canvas" | "base">("note");
  const [canvasTarget, setCanvasTarget] = useState<TreeCanvas | null>(null);
  const [baseTarget, setBaseTarget] = useState<TreeBase | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [rightTab, setRightTab] = useState<"details" | "ai" | "files">("details");
  useEffect(() => { if (typeof window !== "undefined") window.localStorage.setItem("granate.vimMode", vimMode ? "1" : "0"); }, [vimMode]);
  useEffect(() => {
    try {
      window.localStorage.setItem("granate.mode", mode);
    } catch {
      // almacenamiento no disponible
    }
  }, [mode]);

  const handlePreviewChange = useCallback((updated: string) => {
    setContent(updated);
  }, []);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchSeed, setSearchSeed] = useState("");
  const [tagsPanelOpen, setTagsPanelOpen] = useState(false);
  const [propertiesPanelOpen, setPropertiesPanelOpen] = useState(false);
  const [tasksPanelOpen, setTasksPanelOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [quickSwitcherOpen, setQuickSwitcherOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [graphOpen, setGraphOpen] = useState(false);
  const [localGraphOpen, setLocalGraphOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [assistantTab, setAssistantTab] = useState<"ask" | "agent">("ask");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [installHelpOpen, setInstallHelpOpen] = useState(false);
  const [newNoteOpen, setNewNoteOpen] = useState(false);
  const [newNotePath, setNewNotePath] = useState("Nueva nota.md");
  const [newNoteTemplate, setNewNoteTemplate] = useState("");
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderPath, setNewFolderPath] = useState("Nueva carpeta");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  const [picker, setPicker] = useState<{
    open: boolean;
    noteIds: string[];
    title: string;
    description?: string;
    currentPath?: string;
  }>({ open: false, noteIds: [], title: "Mover a…" });
  const [renameTarget, setRenameTarget] = useState<
    | { kind: "note"; note: TreeNote }
    | { kind: "folder"; path: string }
    | null
  >(null);
  const [renameValue, setRenameValue] = useState("");
  const [tagTarget, setTagTarget] = useState<{ ids: string[]; value: string } | null>(null);
  const [llmResult, setLlmResult] = useState<{
    title: string;
    result: string;
    original?: string;
    apply?: boolean;
  } | null>(null);
  const [llmLoading, setLlmLoading] = useState<NoteAction | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [toast, setToast] = useState("");

  const pwaInstall = usePwaInstall();
  const commands: CommandEntry[] = [
    { id: "search", label: "Buscar en la bóveda", shortcut: "Ctrl+K", run: () => setSearchOpen(true) },
    { id: "switcher", label: "Cambiar de nota", shortcut: "Ctrl+O", run: () => setQuickSwitcherOpen(true) },
    { id: "palette", label: "Paleta de comandos", shortcut: "Ctrl+P", run: () => setCommandPaletteOpen(true) },
    { id: "save", label: "Guardar nota actual", shortcut: "Ctrl+S", run: () => void saveNow() },
    { id: "new-note", label: "Nueva nota", run: () => openNewNote() },
    { id: "new-folder", label: "Nueva carpeta", run: () => openNewFolder() },
    { id: "daily", label: "Nota de hoy", run: () => void openDailyNote() },
    { id: "graph", label: "Abrir grafo global", run: () => setGraphOpen(true) },

    { id: "local-graph", label: "Grafo local de la nota activa", run: () => setLocalGraphOpen(true) },
    { id: "chat", label: "Abrir asistente", run: () => setChatOpen(true) },
    { id: "settings", label: "Ajustes", run: () => setSettingsOpen(true) },
    { id: "tags", label: "Etiquetas de la bóveda", run: () => setTagsPanelOpen(true) },
    { id: "properties", label: "Propiedades de la bóveda", run: () => setPropertiesPanelOpen(true) },
    { id: "tasks", label: "Tareas de la bóveda", run: () => setTasksPanelOpen(true) },
    { id: "composer", label: "Componer notas", run: () => setComposerOpen(true) },
    { id: "import", label: "Importar ZIP", run: () => setImportOpen(true) },
    { id: "toggle-edit", label: "Alternar edición/preview", run: () => setMode((m) => (m === "edit" ? "preview" : "edit")) },
    { id: "toggle-vim", label: "Alternar modo Vim", run: () => setVimMode((v) => !v) },
  ];


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
    const online = await isOnline();
    if (!online) {
      const cached = await listCachedNotes(vault.id);
      if (cached.length) {
        setTree({
          notes: cached.map((note) => ({ id: note.id, path: note.path, title: note.title, pinnedAt: null })),
          folders: Array.from(new Set(cached.map((note) => note.path.split("/").slice(0, -1).join("/")).filter(Boolean))),
          tags: [],
          views: undefined,
        });
      }
      return;
    }
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
        views: data.views,
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
    const current = latest.current;
    if (current.activeId && current.content !== current.activeContent) {
      const saved = await saveNow();
      if (!saved) {
        showToast("No se pudo guardar la nota actual; no se cambió de nota");
        return;
      }
    }
    const response = await fetch(`/api/v1/vaults/${vault.id}/notes/${note.id}`).catch(() => null);
    if (!response || !response.ok) {
      const cached = await getCachedNote(vault.id, note.path);
      if (cached) {
        const detail: NoteDetail = {
          id: cached.id,
          path: cached.path,
          title: cached.title,
          content: cached.content,
          frontmatter: {},
          wordCount: 0,
          updatedAt: cached.updatedAt,
          backlinks: [],
          outgoing: [],
          tags: [],
          outline: [],
          unlinkedMentions: [],
        };
        setActive(detail);
        setContent(detail.content);
        setView("note");
        setMode("preview");
        setSaveState("idle");
        showToast("Modo sin conexión: nota desde caché");
        return;
      }
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
      unlinkedMentions: data.note.unlinkedMentions ?? [],
      frontmatter: data.note.frontmatter ?? {},
      content: data.note.content ?? "",
    };
    setActive(detail);
    setContent(detail.content);
    void cacheNote({ id: detail.id, vaultId: vault.id, path: detail.path, title: detail.title, content: detail.content, updatedAt: detail.updatedAt });
    setView("note");
    setMode("preview");
    setSaveState("idle");
    setSidebarOpen(false);
    setDetailsOpen(false);
    void fetch(`/api/v1/vaults/${vault.id}/notes/${note.id}/open`, { method: "POST" })
      .then(() => loadTree())
      .catch(() => undefined);
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

  async function saveNow(explicit?: string): Promise<boolean> {
    const noteId = latest.current.activeId;
    if (!noteId) return true;
    const value = explicit ?? latest.current.content;
    if (explicit === undefined && value === latest.current.activeContent) return true;
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
      return true;
    } catch {
      setSaveState("error");
      return false;
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
    const finalPath = path.endsWith(".md") ? path : `${path}.md`;
    const title = path.split("/").pop()?.replace(/\.md$/, "") ?? "Nota";
    let noteContent = `# ${title}\n\n`;

    if (newNoteTemplate) {
      const templateResponse = await fetch(
        `/api/v1/vaults/${vault.id}/notes?path=${encodeURIComponent(newNoteTemplate)}`,
      );
      if (templateResponse.ok) {
        const templateData = (await templateResponse.json()) as {
          note?: { content?: string };
        };
        if (templateData.note?.content) {
          noteContent = renderTemplate(templateData.note.content, { title, date: new Date() });
        }
      }
    }

    const response = await fetch(`/api/v1/vaults/${vault.id}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: finalPath, content: noteContent }),
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
    setNewNoteTemplate("");
    await loadTree();
    await openNote({ id: data.note.id, path: data.note.path, title: data.note.path });
  }

  /**
   * Extrae una sección de la nota activa a una nota nueva en la misma carpeta:
   * guarda la nota actual sin la sección, crea la nota extraída y la abre.
   */
  async function extractSection(section: { title: string; body: string; anchor: number }) {
    if (!active || !canWrite) return;
    const doc = content;
    const found = findHeadingSection(doc, Math.min(section.anchor, doc.length));
    if (!found) {
      showToast("La sección cambió, inténtalo de nuevo");
      return;
    }
    const body = doc.slice(found.sectionStart, found.sectionEnd).trim();
    if (!body) {
      showToast("La sección está vacía");
      return;
    }

    const folder = active.path.includes("/")
      ? active.path.slice(0, active.path.lastIndexOf("/") + 1)
      : "";
    const taken = new Set(tree.notes.map((note) => note.path.toLowerCase()));
    const base = suggestNoteName(found.title || section.title);
    let candidate = `${folder}${base}.md`;
    let counter = 2;
    while (taken.has(candidate.toLowerCase())) {
      candidate = `${folder}${base} ${counter}.md`;
      counter += 1;
    }

    const response = await fetch(`/api/v1/vaults/${vault.id}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: candidate, content: `${body}\n` }),
    });
    const data = (await response.json()) as {
      note?: { id: string; path: string };
      error?: string;
    };
    if (!response.ok || !data.note) {
      showToast(data.error ?? "No se pudo crear la nota con la sección extraída");
      return;
    }

    if (latest.current.content !== doc) {
      showToast("La nota cambió durante la extracción; la sección sigue en el original");
      await loadTree();
      return;
    }
    const updated = removeSection(doc, found.sectionStart, found.sectionEnd);
    setContent(updated);
    const saved = await saveNow(updated);
    if (!saved) {
      showToast("La nota se creó, pero no se pudo quitar la sección del original");
      return;
    }
    await loadTree();
    await openNote({ id: data.note.id, path: data.note.path, title: data.note.path });
    showToast(`Sección extraída a ${candidate}`);
  }

  async function openDailyNote() {
    const settings = vaultTemplateSettings(vault.settings ?? {});
    const target = todayPath(settings.dailyFolder);
    const existing = await fetch(
      `/api/v1/vaults/${vault.id}/notes?path=${encodeURIComponent(target)}`,
    );
    if (existing.ok) {
      const data = (await existing.json()) as { note: { id: string; path: string } };
      await openNote({ id: data.note.id, path: data.note.path, title: data.note.path });
      return;
    }
    if (!canWrite) {
      showToast("No tienes permisos de escritura");
      return;
    }

    let noteContent = `# ${target.split("/").pop()?.replace(/\.md$/, "")}\n\n`;
    const templateResponse = await fetch(
      `/api/v1/vaults/${vault.id}/notes?path=${encodeURIComponent(settings.dailyTemplate)}`,
    );
    if (templateResponse.ok) {
      const templateData = (await templateResponse.json()) as {
        note?: { content?: string };
      };
      if (templateData.note?.content) {
        noteContent = renderTemplate(templateData.note.content, {
          title: target.split("/").pop()?.replace(/\.md$/, "") ?? "",
          date: new Date(),
        });
      }
    }

    const response = await fetch(`/api/v1/vaults/${vault.id}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: target, content: noteContent }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      note?: { id: string; path: string };
      error?: string;
    };
    if (!response.ok || !data.note) {
      showToast(data.error ?? "No se pudo crear la nota diaria");
      return;
    }
    await loadTree();
    await openNote({ id: data.note.id, path: data.note.path, title: data.note.path });
    showToast("Nota de hoy creada");
  }

  function renameActive() {
    if (!active || !canWrite) return;
    openRenameNote({ id: active.id, path: active.path, title: active.title, pinnedAt: active.pinnedAt });
  }

  async function deleteActive() {
    if (!active || !canWrite) return;
    if (!window.confirm(`¿Mover «${active.title}» a la papelera?`)) return;
    const response = await fetch(`/api/v1/vaults/${vault.id}/notes/${active.id}`, { method: "DELETE" });
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      showToast(data.error ?? "No se pudo mover la nota a la papelera");
      return;
    }
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

  async function createFolder() {
    const path = newFolderPath.trim().replace(/^\/+|\/+$/g, "");
    if (!path) return;
    const response = await fetch(`/api/v1/vaults/${vault.id}/folders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      showToast(data.error ?? "No se pudo crear la carpeta");
      return;
    }
    setNewFolderOpen(false);
    setNewFolderPath("Nueva carpeta");
    await loadTree();
    showToast(`Carpeta creada: ${path}`);
  }

  async function moveNote(noteId: string, folderPath: string) {
    const note = tree.notes.find((item) => item.id === noteId);
    if (!note) return;
    const filename = note.path.split("/").pop();
    if (!filename) return;
    const nextPath = folderPath ? `${folderPath}/${filename}` : filename;
    if (nextPath.toLowerCase() === note.path.toLowerCase()) return;

    if (active?.id === noteId && content !== active.content) {
      const saved = await saveNow();
      if (!saved) {
        showToast("Guarda los cambios antes de mover la nota");
        return;
      }
    }

    const response = await fetch(`/api/v1/vaults/${vault.id}/notes/${noteId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: nextPath }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      note?: NoteDetail;
      error?: string;
    };
    if (!response.ok || !data.note) {
      showToast(data.error ?? "No se pudo mover la nota");
      return;
    }

    if (active?.id === noteId) {
      setActive(data.note);
      setContent(data.note.content);
    }
    await loadTree();
    showToast(folderPath ? `Nota movida a ${folderPath}` : "Nota movida a la raíz");
  }

  function openNewNote(folder?: string) {
    setNewNotePath(folder ? `${folder}/Nueva nota.md` : "Nueva nota.md");
    setNewNoteOpen(true);
  }

  function openNewFolder(parent?: string) {
    setNewFolderPath(parent ? `${parent}/Nueva carpeta` : "Nueva carpeta");
    setNewFolderOpen(true);
  }

  function openMovePicker(noteIds: string[], title = "Mover a…") {
    const note = noteIds.length === 1 ? tree.notes.find((item) => item.id === noteIds[0]) : null;
    const currentPath = note ? note.path.split("/").slice(0, -1).join("/") : "";
    setPicker({
      open: true,
      noteIds,
      title,
      description:
        noteIds.length === 1
          ? note?.path
          : `${noteIds.length} notas seleccionadas`,
      currentPath,
    });
  }

  async function applyBatch(
    action: "move" | "tag" | "untag" | "delete" | "pin" | "unpin",
    ids: string[],
    extra: { folder?: string; tag?: string } = {},
  ) {
    const response = await fetch(`/api/v1/vaults/${vault.id}/notes/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, action, ...extra }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      updated?: number;
      failed?: number;
      error?: string;
      results?: Array<{ id: string; ok: boolean; error?: string }>;
    };
    if (!response.ok) {
      showToast(data.error ?? "No se pudo completar la acción");
      return null;
    }
    return data;
  }

  async function chooseFolder(folderPath: string) {
    const ids = picker.noteIds;
    if (ids.length === 1) {
      await moveNote(ids[0], folderPath);
    } else {
      if (active && ids.includes(active.id) && content !== active.content) {
        const saved = await saveNow();
        if (!saved) {
          showToast("Guarda los cambios antes de mover las notas");
          return;
        }
      }
      const result = await applyBatch("move", ids, { folder: folderPath });
      if (result) {
        showToast(
          result.failed
            ? `${result.updated} movidas, ${result.failed} con error`
            : `${result.updated} notas movidas`,
        );
      }
      await loadTree();
    }
    setSelectedIds(new Set());
    setSelectionMode(false);
    setPicker({ open: false, noteIds: [], title: "Mover a…" });
  }

  function openRenameNote(note: TreeNote) {
    setRenameTarget({ kind: "note", note });
    setRenameValue(note.path);
  }

  function openRenameFolder(path: string) {
    setRenameTarget({ kind: "folder", path });
    setRenameValue(path);
  }

  async function commitRename() {
    if (!renameTarget) return;
    const value = renameValue.trim();
    if (!value || value === (renameTarget.kind === "note" ? renameTarget.note.path : renameTarget.path)) {
      setRenameTarget(null);
      return;
    }

    if (renameTarget.kind === "note") {
      const response = await fetch(
        `/api/v1/vaults/${vault.id}/notes/${renameTarget.note.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: value }),
        },
      );
      const data = (await response.json().catch(() => ({}))) as {
        note?: NoteDetail;
        error?: string;
      };
      if (!response.ok) {
        showToast(data.error ?? "No se pudo renombrar la nota");
        return;
      }
      if (active?.id === renameTarget.note.id && data.note) {
        setActive(data.note);
      }
      showToast("Nota renombrada y enlaces actualizados");
    } else {
      const response = await fetch(`/api/v1/vaults/${vault.id}/folders`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: renameTarget.path, newPath: value }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        movedNotes?: number;
        error?: string;
      };
      if (!response.ok) {
        showToast(data.error ?? "No se pudo renombrar la carpeta");
        return;
      }
      if (
        active &&
        (active.path.toLowerCase() === renameTarget.path.toLowerCase() ||
          active.path.toLowerCase().startsWith(`${renameTarget.path.toLowerCase()}/`))
      ) {
        const nextPath = `${value}${active.path.slice(renameTarget.path.length)}`;
        void openNote({ id: active.id, path: nextPath, title: active.title });
      }
      showToast(
        `Carpeta renombrada (${data.movedNotes ?? 0} notas movidas)`,
      );
    }

    setRenameTarget(null);
    await loadTree();
  }

  async function removeNote(note: TreeNote) {
    if (!canWrite) return;
    if (!window.confirm(`¿Mover «${note.title}» a la papelera?`)) return;
    const response = await fetch(`/api/v1/vaults/${vault.id}/notes/${note.id}`, { method: "DELETE" });
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      showToast(data.error ?? "No se pudo mover la nota a la papelera");
      return;
    }
    if (active?.id === note.id) {
      setActive(null);
      setContent("");
    }
    setSelectedIds((previous) => {
      const next = new Set(previous);
      next.delete(note.id);
      return next;
    });
    await loadTree();
    showToast("Nota movida a la papelera");
  }

  async function removeFolder(path: string) {
    if (!canWrite) return;
    if (!window.confirm(`¿Eliminar la carpeta «${path}»? Solo funciona si está vacía.`)) return;
    const response = await fetch(
      `/api/v1/vaults/${vault.id}/folders?path=${encodeURIComponent(path)}`,
      { method: "DELETE" },
    );
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      showToast(data.error ?? "No se pudo eliminar la carpeta");
      return;
    }
    await loadTree();
    showToast("Carpeta eliminada");
  }

  async function toggleFavorite(note: TreeNote) {
    const pinned = !note.pinnedAt;
    const response = await fetch(
      `/api/v1/vaults/${vault.id}/notes/${note.id}/favorite`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned }),
      },
    );
    if (!response.ok) {
      showToast("No se pudo actualizar el favorito");
      return;
    }
    if (active?.id === note.id) {
      setActive({ ...active, pinnedAt: pinned ? new Date().toISOString() : null });
    }
    await loadTree();
    showToast(pinned ? "Añadida a favoritos" : "Quitada de favoritos");
  }

  function openTag(noteId: string) {
    setTagTarget({ ids: [noteId], value: "" });
  }

  async function commitTag() {
    if (!tagTarget || !tagTarget.value.trim()) return;
    if (active && tagTarget.ids.includes(active.id) && content !== active.content) {
      await saveNow();
    }
    const result = await applyBatch("tag", tagTarget.ids, { tag: tagTarget.value.trim() });
    if (result) {
      showToast(`Etiqueta añadida a ${result.updated} nota(s)`);
    }
    const affectedActive = active && tagTarget.ids.includes(active.id);
    setTagTarget(null);
    await loadTree();
    if (affectedActive && active) {
      await openNote({ id: active.id, path: active.path, title: active.title });
    }
  }

  function handleSelect(noteId: string, shift: boolean, orderedIds?: string[]) {
    setSelectionMode(true);
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (shift && lastSelectedId) {
        const ids = orderedIds ?? tree.notes.map((note) => note.id);
        const from = ids.indexOf(lastSelectedId);
        const to = ids.indexOf(noteId);
        if (from !== -1 && to !== -1) {
          for (let index = Math.min(from, to); index <= Math.max(from, to); index++) {
            next.add(ids[index]);
          }
          return next;
        }
      }
      if (next.has(noteId)) next.delete(noteId);
      else next.add(noteId);
      return next;
    });
    setLastSelectedId(noteId);
  }

  function toggleSelectionMode() {
    if (selectionMode) {
      setSelectionMode(false);
      setSelectedIds(new Set());
    } else {
      setSelectionMode(true);
    }
  }

  function selectAll() {
    setSelectedIds(new Set(tree.notes.map((note) => note.id)));
  }

  function clearSelection() {
    setSelectedIds(new Set());
    setSelectionMode(false);
  }

  async function batchDelete() {
    if (!selectedIds.size) return;
    if (!window.confirm(`¿Mover ${selectedIds.size} notas a la papelera?`)) return;
    const ids = Array.from(selectedIds);
    const result = await applyBatch("delete", ids);
    if (result) showToast(`${result.updated} notas movidas a la papelera`);
    if (active && ids.includes(active.id)) {
      setActive(null);
      setContent("");
    }
    clearSelection();
    await loadTree();
  }

  async function batchTag() {
    if (!selectedIds.size) return;
    setTagTarget({ ids: Array.from(selectedIds), value: "" });
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

  function openHistory() {
    if (!active) return;
    setHistoryOpen(true);
  }

  async function saveProperties(next: Record<string, unknown>) {
    if (!active) return;
    const response = await fetch(`/api/v1/vaults/${vault.id}/notes/${active.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ frontmatter: next }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      note?: NoteDetail;
      error?: string;
    };
    if (!response.ok || !data.note) {
      showToast(data.error ?? "No se pudieron guardar las propiedades");
      return;
    }
    setActive(data.note);
    setContent(data.note.content);
    await loadTree();
    showToast("Propiedades guardadas");
  }

  async function onVersionRestored() {
    if (!active) return;
    await openNote({ id: active.id, path: active.path, title: active.title });
    showToast("Versión restaurada");
  }

  const activeTags = active?.tags ?? [];
  const templateSettings = vaultTemplateSettings(vault.settings ?? {});
  const templateNotes = tree.notes.filter((note) =>
    note.path.startsWith(`${templateSettings.templatesFolder}/`),
  );

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <PreferencesSync />
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
              onClick={() => void openDailyNote()}
              className="btn btn-ghost h-8 gap-1.5 px-2 text-xs"
              title="Nota de hoy"
            >
              <CalendarDays size={15} /> <span className="hidden md:inline">Hoy</span>
            </button>
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
                  void openDailyNote();
                }}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs hover:bg-[var(--panel-2)]"
              >
                <CalendarDays size={14} /> Nota de hoy
              </button>
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
              {pwaInstall.installed ? null : (
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    void pwaInstall.promptInstall().then((outcome) => {
                      if (outcome === "unavailable") setInstallHelpOpen(true);
                    });
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs hover:bg-[var(--panel-2)]"
                >
                  <Download size={14} /> Instalar app
                </button>
              )}
            </div>
          </>
        ) : null}
      </header>

      <div className="relative flex min-h-0 flex-1">
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
              views={tree.views}
              selectionMode={selectionMode}
              selectedIds={selectedIds}
              actions={{
                onOpen: (note) => void openNote(note),
                onNewNote: openNewNote,
                onNewFolder: openNewFolder,
                onDropNote: (noteId, folderPath) => void moveNote(noteId, folderPath),
                onMoveNote: (note) => openMovePicker([note.id]),
                onRenameNote: openRenameNote,
                onDeleteNote: (note) => void removeNote(note),
                onTagNote: (note) => openTag(note.id),
                onToggleFavorite: (note) => void toggleFavorite(note),
                onRenameFolder: openRenameFolder,
                onDeleteFolder: (path) => void removeFolder(path),
                onSelect: handleSelect,
                onToggleSelection: toggleSelectionMode,
                onSelectAll: selectAll,
                onClearSelection: clearSelection,
                onBatchMove: () => openMovePicker(Array.from(selectedIds), "Mover notas"),
                onBatchTag: () => void batchTag(),
                onBatchDelete: () => void batchDelete(),
                onOpenCanvas: (canvas) => {
                  setCanvasTarget(canvas);
                  setView("canvas");
                  setSidebarOpen(false);
                },
                onOpenBase: (base) => {
                  setBaseTarget(base);
                  setView("base");
                  setSidebarOpen(false);
                },
                onNewCanvas: createCanvas,
                onNewBase: createBase,
              }}
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
              <div className="flex h-10 shrink-0 items-center gap-1 overflow-x-auto border-b border-[var(--border)] px-2 sm:h-auto sm:gap-2 sm:px-3">
                <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-[var(--muted)]">
                  <span className="hidden truncate sm:inline">{active.path.split("/").slice(0, -1).join(" / ")}</span>
                  {active.path.includes("/") ? <span className="hidden sm:inline">/</span> : null}
                  <span className="truncate text-[var(--text-soft)]">{active.title}</span>
                </div>

                <div className="ml-auto flex shrink-0 items-center gap-1 pl-2">
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
                  {(
                    [
                      { key: "edit", label: "Editar", icon: PencilLine, title: "Documento Markdown completo" },
                      { key: "preview", label: "Vista", icon: Eye, title: "Vista previa editable" },
                    ] as const
                  ).map(({ key, label, icon: Icon, title }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setMode(key)}
                      className={`btn h-7 gap-1 px-2 text-[11px] ${mode === key ? "bg-[var(--accent-soft)]" : "btn-ghost"}`}
                      title={title}
                      aria-pressed={mode === key}
                    >
                      <Icon size={12} />
                      <span className="hidden sm:inline">{label}</span>
                    </button>
                  ))}
                  <button type="button" onClick={() => void saveNow()} className="btn btn-ghost h-7 w-7 p-0" title="Guardar (Ctrl+S)">
                    <Save size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDetailsOpen(true)}
                    className="btn btn-ghost h-7 w-7 p-0 xl:hidden"
                    title="Detalles de la nota"
                    aria-label="Detalles de la nota"
                  >
                    <PanelRightOpen size={13} />
                  </button>
                  <button type="button" onClick={renameActive} className="btn btn-ghost hidden h-7 w-7 p-0 sm:flex" title="Renombrar">
                    <PencilLine size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setShareOpen(true)}
                    className="btn btn-ghost h-7 w-7 p-0"
                    title="Compartir nota"
                  >
                    <Share2 size={13} />
                  </button>
                  <button type="button" onClick={openHistory} className="btn btn-ghost hidden h-7 w-7 p-0 sm:flex" title="Historial">
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
                        vimMode={vimMode}
                        notes={tree.notes}
                        activeNoteId={active.id}
                        onExtractSection={(section) => void extractSection(section)}
                        onToast={showToast}
                      />
                    </div>
                  </>
                ) : (
                      <div className="scrollbar h-full overflow-y-auto">
                        <MarkdownPreview
                          key={active.id}
                          content={content}
                          vaultId={vault.id}
                          onOpenNote={openByPath}
                          canEdit={canWrite}
                          onChange={handlePreviewChange}
                          onEditConflict={() => showToast("El bloque cambió; vuelve a pulsarlo para editarlo")}
                        />
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

          <footer className="safe-bottom flex min-h-7 shrink-0 items-center gap-3 border-t border-[var(--border)] bg-[var(--panel)] px-3 text-[10px] text-[var(--muted)]">
            <span>{tree.notes?.length ?? 0} notas</span>
            <span>{tree.tags?.length ?? 0} etiquetas</span>
            <span className="ml-auto flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--green)]" /> Neon
            </span>
          </footer>
        </main>

        <aside
          className={`${chatOpen ? "" : "hidden"} fixed inset-y-12 right-0 z-30 w-full max-w-[420px] border-l border-[var(--border)] bg-[var(--panel)] shadow-2xl lg:static lg:inset-auto lg:z-auto lg:w-[380px] lg:shadow-none`}
        >
            <div className="flex h-full flex-col">
              <div className="flex items-center gap-1 border-b border-[var(--border)] px-2 py-1.5">
                <button
                  type="button"
                  onClick={() => setAssistantTab("ask")}
                  className={`btn h-7 px-2 text-[10px] ${assistantTab === "ask" ? "bg-[var(--accent-soft)]" : "btn-ghost"}`}
                >
                  Preguntar
                </button>
                <button
                  type="button"
                  onClick={() => setAssistantTab("agent")}
                  className={`btn h-7 px-2 text-[10px] ${assistantTab === "agent" ? "bg-[var(--accent-soft)]" : "btn-ghost"}`}
                >
                  Agente
                </button>
                <button
                  type="button"
                  className="btn btn-ghost ml-auto h-7 w-7 p-0"
                  onClick={() => setChatOpen(false)}
                  title="Cerrar asistente"
                >
                  ✕
                </button>
              </div>
              <div className="min-h-0 flex-1">
                <div className={assistantTab === "ask" ? "h-full" : "hidden"}>
                  <ChatPanel
                    vaultId={vault.id}
                    onOpenNote={(path) => {
                      void openByPath(path);
                      setChatOpen(false);
                    }}
                  />
                </div>
                <div className={assistantTab === "agent" ? "h-full" : "hidden"}>
                  <AgentPanel
                    vaultId={vault.id}
                    onChanged={() => void loadTree()}
                    onToast={showToast}
                  />
                </div>
              </div>
            </div>
          </aside>
        {!chatOpen && active ? (
          <>
            {detailsOpen ? (
              <button
                type="button"
                aria-label="Cerrar panel de detalles"
                className="absolute inset-0 z-20 bg-black/40 xl:hidden"
                onClick={() => setDetailsOpen(false)}
              />
            ) : null}
            <aside
              className={`${
                detailsOpen
                  ? "fixed inset-y-12 right-0 z-30 flex w-[320px] max-w-[88vw] shadow-2xl"
                  : "hidden"
              } shrink-0 flex-col border-l border-[var(--border)] bg-[var(--panel)] xl:static xl:inset-auto xl:z-auto xl:flex xl:w-[286px] xl:shadow-none`}
            >
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
                  <button
                    type="button"
                    onClick={() => setRightTab("files")}
                    className={`flex-1 px-3 py-2 text-[11px] ${rightTab === "files" ? "border-b-2 border-[var(--accent)] text-[var(--text)]" : "text-[var(--muted)]"}`}
                  >
                    Adjuntos
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost my-1 mr-1 h-7 w-7 shrink-0 self-center p-0 xl:hidden"
                    onClick={() => setDetailsOpen(false)}
                    title="Cerrar"
                    aria-label="Cerrar panel de detalles"
                  >
                    <PanelLeftClose size={14} />
                  </button>
                </div>

              <div className="scrollbar min-h-0 flex-1 space-y-5 overflow-y-auto p-4 text-xs">
                {rightTab === "details" ? (
                  <>
                    <section>
                      <div className="mb-2 flex items-center justify-between">
                        <h3 className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">
                          Propiedades
                        </h3>
                        {canWrite ? (
                          <button
                            type="button"
                            className="btn btn-ghost h-6 px-1.5 text-[10px]"
                            onClick={() => setPropertiesOpen(true)}
                            title="Editar propiedades"
                          >
                            Editar
                          </button>
                        ) : null}
                      </div>
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

                    <section>
                      <h3 className="mb-2 text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">
                        Menciones no enlazadas
                      </h3>
                      <div className="space-y-1">
                        {(active.unlinkedMentions ?? []).map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => void openByPath(item.path)}
                            className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-[var(--panel-2)]"
                          >
                            <div className="truncate text-[11px] text-[var(--text-soft)]">{item.title}</div>
                            {item.snippet ? (
                              <div className="mt-0.5 line-clamp-2 text-[10px] text-[var(--muted)]">{item.snippet}</div>
                            ) : null}
                          </button>
                        ))}
                        {(active.unlinkedMentions?.length ?? 0) === 0 ? (
                          <p className="text-[11px] text-[var(--muted)]">Sin menciones.</p>
                        ) : null}
                      </div>
                    </section>
                  </>
                ) : rightTab === "files" ? (
                  <AttachmentsPanel vaultId={vault.id} onToast={showToast} />
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
          </>
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
      <QuickSwitcher
        open={quickSwitcherOpen}
        onClose={() => setQuickSwitcherOpen(false)}
        vaultId={vault.id}
        onOpenNote={openByPath}
        onCreateNote={(path) => {
          setNewNotePath(path.endsWith(".md") ? path : `${path}.md`);
          setNewNoteOpen(true);
        }}
      />
      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        commands={commands}
      />
      <TagsPanel
        open={tagsPanelOpen}
        onClose={() => setTagsPanelOpen(false)}
        tags={tree.tags}
        onPick={(tag) => {
          setSearchSeed(`#${tag}`);
          setSearchOpen(true);
        }}
      />
      <PropertiesPanel
        open={propertiesPanelOpen}
        onClose={() => setPropertiesPanelOpen(false)}
        vaultId={vault.id}
        onOpenNote={openByPath}
      />
      <TasksPanel
        open={tasksPanelOpen}
        onClose={() => setTasksPanelOpen(false)}
        vaultId={vault.id}
        onOpenNote={openByPath}
      />
      <NoteComposer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        vaultId={vault.id}
        activePath={active?.path ?? ""}
        activeContent={content}
        notes={tree.notes}
        onMerged={() => void loadTree()}
        onSplit={async (newPath, tail, kept) => {
          const finalPath = newPath.endsWith(".md") ? newPath : `${newPath}.md`;
          const create = await fetch(`/api/v1/vaults/${vault.id}/notes`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path: finalPath, content: `${tail}\n` }),
          });
          if (!create.ok) throw new Error("No se pudo crear la nota dividida");
          const saved = await saveNow(kept);
          if (!saved) throw new Error("No se pudo guardar la nota original");
          await loadTree();
        }}
      />

      <Modal open={localGraphOpen} onClose={() => setLocalGraphOpen(false)} title="Grafo local" wide full>
        {active ? (
          <GraphView vaultId={vault.id} onOpenNote={openByPath} centerId={active.id} local />
        ) : (
          <p className="p-6 text-sm text-[var(--muted)]">Abre una nota para ver su grafo local.</p>
        )}
      </Modal>

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
        isOwner={vault.role === "owner"}
        settings={vault.settings ?? {}}
        onChanged={() => void loadTree()}
      />

      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        vaultId={vault.id}
        onImported={() => void loadTree()}
      />

      <InstallHelpModal
        open={installHelpOpen}
        onClose={() => setInstallHelpOpen(false)}
        isIOS={pwaInstall.isIOS}
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
          {templateNotes.length ? (
            <label className="block text-[11px] text-[var(--muted)]">
              Plantilla
              <select
                className="input mt-1 h-9 text-xs"
                value={newNoteTemplate}
                onChange={(event) => setNewNoteTemplate(event.target.value)}
              >
                <option value="">Sin plantilla</option>
                {templateNotes.map((note) => (
                  <option key={note.id} value={note.path}>
                    {note.path}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
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
        open={newFolderOpen}
        onClose={() => setNewFolderOpen(false)}
        title="Nueva carpeta"
        subtitle="Puedes anidar carpetas con /"
      >
        <div className="space-y-4 p-5">
          <input
            className="input"
            value={newFolderPath}
            onChange={(event) => setNewFolderPath(event.target.value)}
            placeholder="Carpeta/Subcarpeta"
            autoFocus
            onKeyDown={(event) => {
              if (event.key === "Enter") void createFolder();
            }}
          />
          <p className="text-[11px] leading-5 text-[var(--muted)]">
            Después podrás arrastrar notas dentro o fuera de la carpeta. También puedes crear una
            nota nueva escribiendo su ruta completa.
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn" onClick={() => setNewFolderOpen(false)}>
              Cancelar
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void createFolder()}>
              Crear carpeta
            </button>
          </div>
        </div>
      </Modal>

      <FolderPicker
        open={picker.open}
        onClose={() => setPicker({ open: false, noteIds: [], title: "Mover a…" })}
        folders={tree.folders}
        currentPath={picker.currentPath}
        title={picker.title}
        description={picker.description}
        onSelect={(folderPath) => void chooseFolder(folderPath)}
      />

      <Modal
        open={Boolean(renameTarget)}
        onClose={() => setRenameTarget(null)}
        title={renameTarget?.kind === "folder" ? "Renombrar carpeta" : "Renombrar nota"}
        subtitle={
          renameTarget?.kind === "folder"
            ? "Se moverán también sus subcarpetas y notas, y se actualizarán los enlaces."
            : "Puedes cambiar el nombre y la carpeta escribiendo la ruta completa."
        }
      >
        <div className="space-y-4 p-5">
          <input
            className="input"
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
            placeholder={renameTarget?.kind === "folder" ? "Carpeta/Subcarpeta" : "Carpeta/Nota.md"}
            autoFocus
            onKeyDown={(event) => {
              if (event.key === "Enter") void commitRename();
            }}
          />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn" onClick={() => setRenameTarget(null)}>
              Cancelar
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void commitRename()}>
              Renombrar
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(tagTarget)}
        onClose={() => setTagTarget(null)}
        title={
          tagTarget && tagTarget.ids.length > 1
            ? `Etiquetar ${tagTarget.ids.length} notas`
            : "Añadir etiqueta"
        }
        subtitle="Se añade al frontmatter de cada nota."
      >
        <div className="space-y-4 p-5">
          <input
            className="input"
            value={tagTarget?.value ?? ""}
            onChange={(event) =>
              setTagTarget((current) =>
                current ? { ...current, value: event.target.value } : current,
              )
            }
            placeholder="etiqueta"
            autoFocus
            onKeyDown={(event) => {
              if (event.key === "Enter") void commitTag();
            }}
          />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn" onClick={() => setTagTarget(null)}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!tagTarget?.value.trim()}
              onClick={() => void commitTag()}
            >
              Añadir
            </button>
          </div>
        </div>
      </Modal>

      {active ? (
        <VersionHistory
          open={historyOpen}
          onClose={() => setHistoryOpen(false)}
          vaultId={vault.id}
          noteId={active.id}
          notePath={active.path}
          currentContent={content}
          onRestored={() => void onVersionRestored()}
        />
      ) : null}

      {active ? (
        <ShareModal
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          vaultId={vault.id}
          noteId={active.id}
          notePath={active.path}
          onToast={showToast}
        />
      ) : null}

      {active ? (
        <PropertiesEditor
          open={propertiesOpen}
          onClose={() => setPropertiesOpen(false)}
          frontmatter={active.frontmatter ?? {}}
          onSave={saveProperties}
        />
      ) : null}

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
        <div role="status" aria-live="polite" className="safe-toast fixed left-1/2 z-[60] -translate-x-1/2 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-4 py-2 text-xs shadow-xl">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
