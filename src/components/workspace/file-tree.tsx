"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckSquare,
  ChevronRight,
  FilePlus2,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  History,
  Home,
  LayoutDashboard,
  ListChecks,
  MoreHorizontal,
  Pencil,
  Plus,
  Square,
  SquareKanban,
  Star,
  Tag,
  Trash2,
  FolderInput,
  X,
} from "lucide-react";
import { ContextMenu, type MenuEntry } from "@/components/ui/context-menu";
import { ContextBottomSheet } from "@/components/ui/context-bottom-sheet";
import { useCoarsePointer } from "@/hooks/use-coarse-pointer";

export type TreeNote = {
  id: string;
  path: string;
  title: string;
  pinnedAt?: string | null;
};
export type TreeCanvas = { id: string; path: string };
export type TreeBase = { id: string; path: string };

export type TreeSmartViews = {
  favorites: TreeNote[];
  recents: TreeNote[];
  orphans: TreeNote[];
  untagged: TreeNote[];
};

type SmartViewKey = keyof TreeSmartViews;

export type FileTreeActions = {
  onOpen: (note: TreeNote) => void;
  onNewNote: (folder?: string) => void;
  onNewFolder: (parent?: string) => void;
  onDropNote: (noteId: string, folderPath: string) => void;
  onMoveNote: (note: TreeNote) => void;
  onRenameNote: (note: TreeNote) => void;
  onDeleteNote: (note: TreeNote) => void;
  onTagNote: (note: TreeNote) => void;
  onToggleFavorite: (note: TreeNote) => void;
  onRenameFolder: (path: string) => void;
  onDeleteFolder: (path: string) => void;
  onSelect: (noteId: string, shift: boolean, orderedIds?: string[]) => void;
  onToggleSelection: () => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onBatchMove: () => void;
  onBatchTag: () => void;
  onBatchDelete: () => void;
  onOpenCanvas: (canvas: TreeCanvas) => void;
  onOpenBase: (base: TreeBase) => void;
  onNewCanvas: () => void;
  onNewBase: () => void;
};

type FolderNode = { kind: "folder"; name: string; path: string; children: GraphNode[] };
type GraphNode = FolderNode | { kind: "note"; name: string; path: string; id: string; pinnedAt?: string | null };

function buildNodes(notes: TreeNote[], folders: string[]): FolderNode {
  const root: FolderNode = { kind: "folder", name: "", path: "", children: [] };

  const ensureFolder = (path: string): FolderNode => {
    const parts = path.split("/").filter(Boolean);
    let current: FolderNode = root;
    let accumulated = "";
    for (const part of parts) {
      accumulated = accumulated ? `${accumulated}/${part}` : part;
      let child = current.children.find(
        (node): node is FolderNode => node.kind === "folder" && node.path === accumulated,
      );
      if (!child) {
        child = { kind: "folder", name: part, path: accumulated, children: [] };
        current.children.push(child);
      }
      current = child;
    }
    return current;
  };

  for (const folder of folders) {
    if (folder) ensureFolder(folder);
  }

  for (const note of notes) {
    const parentPath = note.path.split("/").slice(0, -1).join("/");
    const parent = ensureFolder(parentPath);
    parent.children.push({
      kind: "note",
      name: note.path.split("/").pop()?.replace(/\.md$/, "") ?? note.title,
      path: note.path,
      id: note.id,
      pinnedAt: note.pinnedAt,
    });
  }

  const sort = (node: FolderNode) => {
    node.children.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name, "es");
    });
    for (const child of node.children) if (child.kind === "folder") sort(child);
  };
  sort(root);
  return root;
}

const SMART_VIEW_META: Array<{
  key: SmartViewKey;
  label: string;
  icon: React.ReactNode;
}> = [
  { key: "favorites", label: "Favoritos", icon: <Star size={11} /> },
  { key: "recents", label: "Recientes", icon: <History size={11} /> },
  { key: "orphans", label: "Huérfanas", icon: <FileText size={11} /> },
  { key: "untagged", label: "Sin etiquetas", icon: <Tag size={11} /> },
];

export function FileTree({ loading,
  
  notes,
  folders,
  canvases,
  bases,
  activeId,
  views,
  selectionMode,
  selectedIds,
  actions,
}: {
  loading?: boolean;
  
  notes: TreeNote[];
  folders: string[];
  canvases: TreeCanvas[];
  bases: TreeBase[];
  activeId?: string;
  views?: TreeSmartViews;
  selectionMode: boolean;
  selectedIds: Set<string>;
  actions: FileTreeActions;
}) {
  const tree = useMemo(() => buildNodes(notes, folders), [notes, folders]);
  const coarsePointer = useCoarsePointer();
  const allFolders = useMemo(() => new Set(folders.filter(Boolean)), [folders]);
  const [expanded, setExpanded] = useState<Set<string>>(allFolders);
  const knownFolders = useRef<Set<string>>(allFolders);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [smartView, setSmartView] = useState<SmartViewKey | null>(null);
  const [menu, setMenu] = useState<
    | { x: number; y: number; note?: TreeNote; folder?: string }
    | { sheet: true; note?: TreeNote; folder?: string }
    | null
  >(null);

  useEffect(() => {
    const nextKnown = new Set(folders.filter(Boolean));
    setExpanded((previous) => {
      const next = new Set(previous);
      for (const folder of nextKnown) {
        if (!knownFolders.current.has(folder)) next.add(folder);
      }
      for (const folder of next) {
        if (!nextKnown.has(folder)) next.delete(folder);
      }
      return next;
    });
    knownFolders.current = nextKnown;
  }, [folders]);

  function toggle(path: string) {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function dropNote(event: React.DragEvent, folderPath: string) {
    event.preventDefault();
    event.stopPropagation();
    const noteId = event.dataTransfer.getData("text/plain");
    setDragOver(null);
    if (!noteId) return;
    if (folderPath) setExpanded((previous) => new Set(previous).add(folderPath));
    actions.onDropNote(noteId, folderPath);
  }

  function openNoteMenu(event: React.MouseEvent, note: TreeNote) {
    // En táctil el menú solo se abre con el botón explícito (···).
    if (coarsePointer) return;
    event.preventDefault();
    event.stopPropagation();
    setMenu({ x: event.clientX, y: event.clientY, note });
  }

  function openNoteMenuFromButton(event: React.MouseEvent, note: TreeNote) {
    event.preventDefault();
    event.stopPropagation();
    if (coarsePointer) {
      setMenu({ sheet: true, note });
      return;
    }
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu({ x: rect.right - 8, y: rect.bottom + 4, note });
  }

  function openFolderMenu(event: React.MouseEvent, path: string) {
    // En táctil el menú solo se abre con el botón explícito (···).
    if (coarsePointer) return;
    event.preventDefault();
    event.stopPropagation();
    setMenu({ x: event.clientX, y: event.clientY, folder: path });
  }

  function openFolderMenuFromButton(event: React.MouseEvent, path: string) {
    event.preventDefault();
    event.stopPropagation();
    if (coarsePointer) {
      setMenu({ sheet: true, folder: path });
      return;
    }
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu({ x: rect.right - 8, y: rect.bottom + 4, folder: path });
  }

  function noteEntries(note: TreeNote): MenuEntry[] {
    return [
      {
        label: "Abrir",
        icon: <FileText size={13} />,
        onClick: () => actions.onOpen(note),
      },
      {
        label: "Renombrar",
        icon: <Pencil size={13} />,
        onClick: () => actions.onRenameNote(note),
      },
      {
        label: "Mover a…",
        icon: <FolderInput size={13} />,
        onClick: () => actions.onMoveNote(note),
      },
      {
        label: "Etiquetar",
        icon: <Tag size={13} />,
        onClick: () => actions.onTagNote(note),
      },
      {
        label: note.pinnedAt ? "Quitar de favoritos" : "Añadir a favoritos",
        icon: <Star size={13} />,
        onClick: () => actions.onToggleFavorite(note),
      },
      { separator: true },
      {
        label: "Mover a papelera",
        icon: <Trash2 size={13} />,
        danger: true,
        onClick: () => actions.onDeleteNote(note),
      },
    ];
  }

  function folderEntries(path: string): MenuEntry[] {
    return [
      {
        label: "Nueva nota dentro",
        icon: <FilePlus2 size={13} />,
        onClick: () => actions.onNewNote(path),
      },
      {
        label: "Nueva subcarpeta",
        icon: <FolderPlus size={13} />,
        onClick: () => actions.onNewFolder(path),
      },
      { separator: true },
      {
        label: "Renombrar carpeta",
        icon: <Pencil size={13} />,
        onClick: () => actions.onRenameFolder(path),
      },
      {
        label: "Eliminar carpeta",
        icon: <Trash2 size={13} />,
        danger: true,
        onClick: () => actions.onDeleteFolder(path),
      },
    ];
  }

  function renderNoteRow(note: TreeNote, depth: number, extraKey = "") {
    const active = note.id === activeId;
    const selected = selectedIds.has(note.id);
    return (
      <div
        key={`n-${note.id}${extraKey}`}
        draggable
        onDragStart={(event) => {
          event.dataTransfer.setData("text/plain", note.id);
          event.dataTransfer.effectAllowed = "move";
        }}
        onDragEnd={() => setDragOver(null)}
        onContextMenu={(event) => openNoteMenu(event, note)}
        className={`group flex w-full items-center rounded-md pr-1 transition-colors ${
          selected
            ? "bg-[var(--accent-soft)] text-[var(--text)]"
            : active
              ? "bg-[var(--accent-soft)] text-[var(--text)]"
              : "text-[var(--text-soft)] hover:bg-[var(--panel-2)]"
        }`}
        style={{ paddingLeft: `${depth * 12 + 4}px`, contentVisibility: "auto", containIntrinsicSize: "0 28px" }}
      >
        <button
          type="button"
          onClick={(event) => {
            if (selectionMode || event.ctrlKey || event.metaKey || event.shiftKey) {
              event.preventDefault();
              actions.onSelect(note.id, event.shiftKey, visibleOrder);
              return;
            }
            actions.onOpen(note);
          }}
          className="flex min-w-0 flex-1 cursor-grab items-center gap-1.5 py-[5px] text-left text-[12.5px] active:cursor-grabbing"
          title={`${note.path} · clic derecho para acciones`}
        >
          {selectionMode ? (
            selected ? (
              <CheckSquare size={13} className="shrink-0 text-[var(--accent-2)]" />
            ) : (
              <Square size={13} className="shrink-0 text-[var(--muted)]" />
            )
          ) : (
            <FileText
              size={13}
              className={`shrink-0 ${active ? "text-[var(--accent-2)]" : "text-[var(--muted)]"}`}
            />
          )}
          <span className="truncate">{note.path.split("/").pop()?.replace(/\.md$/, "")}</span>
          {note.pinnedAt ? (
            <Star size={10} className="shrink-0 text-[var(--gold)]" fill="currentColor" />
          ) : null}
        </button>
        <button
          type="button"
          aria-label="Acciones de la nota"
          title="Acciones"
          onClick={(event) => openNoteMenuFromButton(event, note)}
          className="grid h-8 w-8 shrink-0 place-items-center rounded text-[var(--muted)] opacity-100 hover:bg-[var(--panel)] hover:text-[var(--text)] sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
        >
          <MoreHorizontal size={13} />
        </button>
      </div>
    );
  }

  function renderNode(node: GraphNode, depth: number): React.ReactNode {
    if (node.kind === "note") {
      return renderNoteRow(
        { id: node.id, path: node.path, title: node.name, pinnedAt: node.pinnedAt },
        depth,
      );
    }

    const open = expanded.has(node.path);
    return (
      <div key={`f-${node.path || "root"}`}>
        {node.path ? (
          <div
            onDragOver={(event) => {
              event.preventDefault();
              event.stopPropagation();
              event.dataTransfer.dropEffect = "move";
              setDragOver(node.path);
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setDragOver(null);
              }
            }}
            onDrop={(event) => dropNote(event, node.path)}
            onContextMenu={(event) => openFolderMenu(event, node.path)}
            className={`group flex w-full items-center rounded-md pr-1 transition-colors ${
              dragOver === node.path
                ? "bg-[var(--accent-soft)] ring-1 ring-[var(--accent)]"
                : "text-[var(--text-soft)] hover:bg-[var(--panel-2)]"
            }`}
            style={{ paddingLeft: `${depth * 12 + 2}px` }}
          >
            <button
              type="button"
              onClick={() => toggle(node.path)}
              className="flex min-w-0 flex-1 items-center gap-1.5 py-[5px] text-left text-[12.5px]"
              title={`${node.path} · suelta aquí una nota`}
            >
              <ChevronRight
                size={12}
                className={`shrink-0 text-[var(--muted)] transition-transform ${open ? "rotate-90" : ""}`}
              />
              {open ? (
                <FolderOpen size={14} className="shrink-0 text-[var(--gold)]" />
              ) : (
                <Folder size={14} className="shrink-0 text-[var(--gold)]" />
              )}
              <span className="truncate">{node.name}</span>
            </button>
            <button
              type="button"
              aria-label="Acciones de la carpeta"
              title="Acciones"
              onClick={(event) => openFolderMenuFromButton(event, node.path)}
              className="grid h-8 w-8 shrink-0 place-items-center rounded text-[var(--muted)] opacity-100 hover:bg-[var(--panel)] hover:text-[var(--text)] sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
            >
              <MoreHorizontal size={13} />
            </button>
          </div>
        ) : null}
        {open || !node.path ? (
          <div>
            {node.children.map((child) => renderNode(child, node.path ? depth + 1 : depth))}
          </div>
        ) : null}
      </div>
    );
  }

  const activeViewNotes = smartView && views ? views[smartView] : null;

  const visibleOrder = useMemo(() => {
    if (activeViewNotes) return activeViewNotes.map((note) => note.id);
    const ids: string[] = [];
    const walk = (node: FolderNode) => {
      for (const child of node.children) {
        if (child.kind === "note") ids.push(child.id);
        else if (expanded.has(child.path)) walk(child);
      }
    };
    walk(tree);
    return ids;
  }, [activeViewNotes, tree, expanded]);

  return (
    <div className="flex h-full flex-col">
      <div
        className={`flex items-center justify-between px-3 py-2 transition-colors ${
          dragOver === "__root__"
            ? "bg-[var(--accent-soft)] ring-1 ring-inset ring-[var(--accent)]"
            : ""
        }`}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          setDragOver("__root__");
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setDragOver(null);
          }
        }}
        onDrop={(event) => dropNote(event, "")}
        title="Suelta aquí para mover a la raíz"
      >
        <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--muted)]">
          Notas
        </span>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={actions.onToggleSelection}
            className={`btn btn-ghost h-8 w-8 p-0 ${
              selectionMode ? "bg-[var(--accent-soft)] text-[var(--text)]" : ""
            }`}
            title={selectionMode ? "Salir de selección" : "Seleccionar varias notas"}
          >
            <ListChecks size={14} />
          </button>
          <button
            type="button"
            onClick={() => actions.onNewFolder()}
            className="btn btn-ghost h-8 w-8 p-0"
            title="Nueva carpeta"
          >
            <FolderPlus size={14} />
          </button>
          <button
            type="button"
            onClick={() => actions.onNewNote()}
            className="btn btn-ghost h-8 w-8 p-0"
            title="Nueva nota"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      <div className="scrollbar min-h-0 flex-1 overflow-y-auto px-1.5 pb-4">
        <div
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            setDragOver("__root__");
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              setDragOver(null);
            }
          }}
          onDrop={(event) => dropNote(event, "")}
          className={`mb-1 flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] transition-colors ${
            dragOver === "__root__"
              ? "bg-[var(--accent-soft)] text-[var(--text)] ring-1 ring-[var(--accent)]"
              : "text-[var(--muted)] hover:bg-[var(--panel-2)]"
          }`}
          title="Mover a la raíz"
        >
          <Home size={12} />
          Raíz
        </div>

        {views ? (
          <div className="mb-2 grid grid-cols-2 gap-1 px-0.5">
            {SMART_VIEW_META.map((view) => {
              const count = views[view.key].length;
              const active = smartView === view.key;
              return (
                <button
                  key={view.key}
                  type="button"
                  onClick={() => setSmartView(active ? null : view.key)}
                  className={`flex items-center gap-1 rounded-md border px-1.5 py-1 text-left text-[10px] transition-colors ${
                    active
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text)]"
                      : "border-[var(--border-soft)] text-[var(--text-soft)] hover:bg-[var(--panel-2)]"
                  }`}
                  title={`${view.label}: ${count}`}
                >
                  {view.icon}
                  <span className="min-w-0 flex-1 truncate">{view.label}</span>
                  <span className="text-[9px] text-[var(--muted)]">{count}</span>
                </button>
              );
            })}
          </div>
        ) : null}

        {activeViewNotes ? (
          <div>
            <div className="mb-1 flex items-center gap-1 px-1">
              <button
                type="button"
                onClick={() => setSmartView(null)}
                className="btn btn-ghost h-8 gap-1 px-1.5 text-[10px]"
              >
                <ChevronRight size={12} className="rotate-180" /> Volver al árbol
              </button>
              <span className="ml-auto text-[9px] text-[var(--muted)]">
                {activeViewNotes.length}
              </span>
            </div>
            {activeViewNotes.length === 0 ? (
              <p className="px-2 py-4 text-[11px] text-[var(--muted)]">Nada por aquí.</p>
            ) : (
              activeViewNotes.map((note) => renderNoteRow(note, 0, `-${smartView}`))
            )}
          </div>
        ) : (
          <>
            {renderNode(tree, 0)}
            {notes.length === 0 && folders.length === 0 ? (
              <p className="px-3 py-4 text-xs leading-5 text-[var(--muted)]">
                {loading
                ? "Cargando la bóveda…"
                : "Bóveda vacía. Crea una nota, una carpeta o importa tu ZIP de Obsidian."}
              </p>
            ) : null}
          </>
        )}

        <div className="mt-5 flex items-center justify-between px-2 py-1">
          <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--muted)]">
            Canvas
          </span>
          <button
            type="button"
            onClick={actions.onNewCanvas}
            className="btn btn-ghost h-8 w-8 p-0"
            title="Nuevo canvas"
          >
            <Plus size={14} />
          </button>
        </div>
        {canvases.map((canvas) => (
          <button
            key={canvas.id}
            type="button"
            onClick={() => actions.onOpenCanvas(canvas)}
            className="flex w-full items-center gap-1.5 rounded-md py-[5px] pl-3 pr-2 text-left text-[12.5px] text-[var(--text-soft)] hover:bg-[var(--panel-2)]"
          >
            <LayoutDashboard size={13} className="text-[var(--blue)]" />
            <span className="truncate">{canvas.path.split("/").pop()}</span>
          </button>
        ))}
        {canvases.length === 0 ? (
          <p className="px-3 py-1 text-[11px] text-[var(--muted)]">Sin canvas todavía.</p>
        ) : null}

        <div className="mt-5 flex items-center gap-2 px-2 py-1">
          <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--muted)]">
            Bases
          </span>
          <button
            type="button"
            onClick={actions.onNewBase}
            className="btn btn-ghost ml-auto h-8 w-8 p-0"
            title="Nueva base"
          >
            <Plus size={14} />
          </button>
        </div>
        {bases.map((base) => (
          <button
            key={base.id}
            type="button"
            onClick={() => actions.onOpenBase(base)}
            className="flex w-full items-center gap-1.5 rounded-md py-[5px] pl-3 pr-2 text-left text-[12.5px] text-[var(--text-soft)] hover:bg-[var(--panel-2)]"
          >
            <SquareKanban size={13} className="text-[var(--green)]" />
            <span className="truncate">{base.path.split("/").pop()}</span>
          </button>
        ))}
        {bases.length === 0 ? (
          <p className="px-3 py-1 text-[11px] text-[var(--muted)]">Sin bases todavía.</p>
        ) : null}
      </div>

      {selectionMode ? (
        <div className="shrink-0 border-t border-[var(--border)] bg-[var(--panel)] p-2">
          <div className="flex items-center gap-1 text-[10px] text-[var(--muted)]">
            <span className="flex-1">{selectedIds.size} seleccionadas</span>
            <button type="button" className="btn btn-ghost h-8 px-1.5 text-[10px]" onClick={actions.onSelectAll}>
              Todo
            </button>
            <button
              type="button"
              className="btn btn-ghost h-8 w-8 p-0"
              onClick={actions.onClearSelection}
              title="Salir de selección"
            >
              <X size={12} />
            </button>
          </div>
          <div className="mt-1.5 grid grid-cols-3 gap-1">
            <button
              type="button"
              className="btn h-7 justify-center gap-1 px-1 text-[10px]"
              disabled={!selectedIds.size}
              onClick={actions.onBatchMove}
            >
              <FolderInput size={12} /> Mover
            </button>
            <button
              type="button"
              className="btn h-7 justify-center gap-1 px-1 text-[10px]"
              disabled={!selectedIds.size}
              onClick={actions.onBatchTag}
            >
              <Tag size={12} /> Etiquetar
            </button>
            <button
              type="button"
              className="btn h-7 justify-center gap-1 px-1 text-[10px] text-[var(--accent-2)]"
              disabled={!selectedIds.size}
              onClick={actions.onBatchDelete}
            >
              <Trash2 size={12} /> Borrar
            </button>
          </div>
        </div>
      ) : null}

      {menu && "sheet" in menu ? (
        <ContextBottomSheet
          title={
            menu.note
              ? menu.note.path.split("/").pop()?.replace(/\.md$/, "") ?? "Acciones"
              : menu.folder || "Acciones"
          }
          entries={menu.note ? noteEntries(menu.note) : folderEntries(menu.folder ?? "")}
          onClose={() => setMenu(null)}
        />
      ) : null}
      {menu && "x" in menu ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          entries={menu.note ? noteEntries(menu.note) : folderEntries(menu.folder ?? "")}
          onClose={() => setMenu(null)}
        />
      ) : null}
    </div>
  );
}
