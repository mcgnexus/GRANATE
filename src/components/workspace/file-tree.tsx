"use client";

import { useMemo, useState } from "react";
import {
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Home,
  LayoutDashboard,
  Plus,
  SquareKanban,
} from "lucide-react";

export type TreeNote = { id: string; path: string; title: string };
export type TreeCanvas = { id: string; path: string };
export type TreeBase = { id: string; path: string };

type FolderNode = { kind: "folder"; name: string; path: string; children: GraphNode[] };
type GraphNode =
  | FolderNode
  | { kind: "note"; name: string; path: string; id: string };

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

export function FileTree({
  notes,
  folders,
  canvases,
  bases,
  activeId,
  onOpen,
  onNewNote,
  onNewFolder,
  onMoveNote,
  onOpenCanvas,
  onOpenBase,
  onNewCanvas,
  onNewBase,
}: {
  notes: TreeNote[];
  folders: string[];
  canvases: TreeCanvas[];
  bases: TreeBase[];
  activeId?: string;
  onOpen: (note: TreeNote) => void;
  onNewNote: () => void;
  onNewFolder: () => void;
  onMoveNote: (noteId: string, folderPath: string) => void;
  onOpenCanvas: (canvas: TreeCanvas) => void;
  onOpenBase: (base: TreeBase) => void;
  onNewCanvas: () => void;
  onNewBase: () => void;
}) {
  const tree = useMemo(() => buildNodes(notes, folders), [notes, folders]);
  const allFolders = useMemo(
    () => new Set(folders.filter(Boolean)),
    [folders],
  );
  const [expanded, setExpanded] = useState<Set<string>>(allFolders);
  const [dragOver, setDragOver] = useState<string | null>(null);

  function dropNote(event: React.DragEvent, folderPath: string) {
    event.preventDefault();
    const noteId = event.dataTransfer.getData("text/plain");
    setDragOver(null);
    if (!noteId) return;
    if (folderPath) {
      setExpanded((previous) => new Set(previous).add(folderPath));
    }
    onMoveNote(noteId, folderPath);
  }

  function toggle(path: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function renderNode(node: GraphNode, depth: number): React.ReactNode {
    if (node.kind === "note") {
      const active = node.id === activeId;
      return (
        <button
          key={`n-${node.id}`}
          type="button"
          draggable
          onDragStart={(event) => {
            event.dataTransfer.setData("text/plain", node.id);
            event.dataTransfer.effectAllowed = "move";
          }}
          onDragEnd={() => setDragOver(null)}
          onClick={() => onOpen({ id: node.id, path: node.path, title: node.name })}
          className={`group flex w-full cursor-grab items-center gap-1.5 rounded-md py-[5px] pr-2 text-left text-[12.5px] transition-colors active:cursor-grabbing ${
            active
              ? "bg-[var(--accent-soft)] text-[var(--text)]"
              : "text-[var(--text-soft)] hover:bg-[var(--panel-2)]"
          }`}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
          title={`${node.path} · arrastra a una carpeta`}
        >
          <FileText
            size={13}
            className={active ? "text-[var(--accent-2)]" : "text-[var(--muted)]"}
          />
          <span className="truncate">{node.name}</span>
        </button>
      );
    }

    const open = expanded.has(node.path);
    return (
      <div key={`f-${node.path || "root"}`}>
        {node.path ? (
          <button
            type="button"
            onClick={() => toggle(node.path)}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              setDragOver(node.path);
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setDragOver(null);
              }
            }}
            onDrop={(event) => dropNote(event, node.path)}
            className={`flex w-full items-center gap-1.5 rounded-md py-[5px] pr-2 text-left text-[12.5px] text-[var(--text-soft)] transition-colors ${
              dragOver === node.path
                ? "bg-[var(--accent-soft)] ring-1 ring-[var(--accent)]"
                : "hover:bg-[var(--panel-2)]"
            }`}
            style={{ paddingLeft: `${depth * 12 + 4}px` }}
            title={`${node.path} · suelta aquí una nota`}
          >
            <ChevronRight
              size={12}
              className={`text-[var(--muted)] transition-transform ${open ? "rotate-90" : ""}`}
            />
            {open ? (
              <FolderOpen size={14} className="text-[var(--gold)]" />
            ) : (
              <Folder size={14} className="text-[var(--gold)]" />
            )}
            <span className="truncate">{node.name}</span>
          </button>
        ) : null}
        {open || !node.path ? (
          <div>
            {node.children.map((child) => renderNode(child, node.path ? depth + 1 : depth))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div
        className={`flex items-center justify-between px-3 py-2 transition-colors ${
          dragOver === "__root__" ? "bg-[var(--accent-soft)] ring-1 ring-inset ring-[var(--accent)]" : ""
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
            onClick={onNewFolder}
            className="btn btn-ghost h-6 w-6 p-0"
            title="Nueva carpeta"
          >
            <FolderPlus size={14} />
          </button>
          <button
            type="button"
            onClick={onNewNote}
            className="btn btn-ghost h-6 w-6 p-0"
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
        {renderNode(tree, 0)}
        {notes.length === 0 && folders.length === 0 ? (
          <p className="px-3 py-4 text-xs leading-5 text-[var(--muted)]">
            Bóveda vacía. Crea una nota, una carpeta o importa tu ZIP de Obsidian.
          </p>
        ) : null}

        <div className="mt-5 flex items-center justify-between px-2 py-1">
          <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--muted)]">
            Canvas
          </span>
          <button
            type="button"
            onClick={onNewCanvas}
            className="btn btn-ghost h-6 w-6 p-0"
            title="Nuevo canvas"
          >
            <Plus size={14} />
          </button>
        </div>
        {canvases.map((canvas) => (
          <button
            key={canvas.id}
            type="button"
            onClick={() => onOpenCanvas(canvas)}
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
            onClick={onNewBase}
            className="btn btn-ghost ml-auto h-6 w-6 p-0"
            title="Nueva base"
          >
            <Plus size={14} />
          </button>
        </div>
        {bases.map((base) => (
          <button
            key={base.id}
            type="button"
            onClick={() => onOpenBase(base)}
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
    </div>
  );
}
