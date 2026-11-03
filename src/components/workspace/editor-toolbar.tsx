"use client";

import { useRef, useState } from "react";
import {
  Bold,
  ChevronDown,
  FileText,
  Hash,
  Italic,
  Link2,
  Paperclip,
  Search,
  Underline,
} from "lucide-react";
import type { MarkdownEditorHandle } from "./markdown-editor";
import type { TreeNote } from "./file-tree";

type Tag = { name: string; count: number };

type Props = {
  editorRef: React.RefObject<MarkdownEditorHandle | null>;
  vaultId: string;
  notes: TreeNote[];
  tags: Tag[];
  activeNoteId?: string;
  onToast: (message: string) => void;
};

function ToolButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="btn btn-ghost h-7 w-7 shrink-0 p-0"
    >
      {children}
    </button>
  );
}

export function EditorToolbar({
  editorRef,
  vaultId,
  notes,
  tags,
  activeNoteId,
  onToast,
}: Props) {
  const [panel, setPanel] = useState<"tag" | "note" | null>(null);
  const [query, setQuery] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  function openPanel(next: "tag" | "note") {
    setPanel((current) => (current === next ? null : next));
    setQuery("");
  }

  function insertTag(name: string) {
    const clean = name.replace(/^#/, "").replace(/\s+/g, "-").trim();
    if (!clean) return;
    editorRef.current?.insertText(`#${clean} `);
    setPanel(null);
    setQuery("");
  }

  function insertNote(note: TreeNote) {
    const target = note.path.replace(/\.md$/i, "");
    editorRef.current?.insertText(`[[${target}]]`);
    setPanel(null);
    setQuery("");
  }

  async function uploadFile(file: File) {
    if (file.size > 4 * 1024 * 1024) {
      onToast("El archivo supera 4 MB (límite de subida en Vercel).");
      return;
    }
    const cleanName = file.name.replace(/[\\/]/g, "-");
    const path = `Adjuntos/${cleanName}`;
    const body = new FormData();
    body.append("file", file);
    body.append("path", path);
    try {
      const response = await fetch(`/api/v1/vaults/${vaultId}/attachments`, {
        method: "POST",
        body,
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        onToast(data.error ?? "No se pudo subir el adjunto");
        return;
      }
      const isImage = /\.(png|jpe?g|gif|webp|svg|avif)$/i.test(cleanName);
      editorRef.current?.insertText(`${isImage ? "!" : ""}[[${path}]]`);
      onToast(`Adjunto añadido: ${cleanName}`);
    } catch {
      onToast("Error de red al subir el adjunto");
    }
  }

  const filteredTags = tags
    .filter((tag) => tag.name.toLowerCase().includes(query.trim().toLowerCase()))
    .slice(0, 12);

  const filteredNotes = notes
    .filter((note) => note.id !== activeNoteId)
    .filter((note) => {
      const search = query.trim().toLowerCase();
      if (!search) return true;
      return note.title.toLowerCase().includes(search) || note.path.toLowerCase().includes(search);
    })
    .slice(0, 10);

  return (
    <div className="relative flex h-9 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-[var(--border)] bg-[var(--panel)] px-2">
      <ToolButton label="Negrita (Ctrl+B)" onClick={() => editorRef.current?.wrapSelection("**", "**")}>
        <Bold size={14} />
      </ToolButton>
      <ToolButton label="Cursiva (Ctrl+I)" onClick={() => editorRef.current?.wrapSelection("*", "*")}>
        <Italic size={14} />
      </ToolButton>
      <ToolButton
        label="Subrayado (Ctrl+U)"
        onClick={() => editorRef.current?.wrapSelection("<u>", "</u>")}
      >
        <Underline size={14} />
      </ToolButton>

      <span className="mx-1 h-4 w-px shrink-0 bg-[var(--border)]" />

      <label className="relative shrink-0">
        <span className="sr-only">Tipo de encabezado</span>
        <select
          defaultValue=""
          onChange={(event) => {
            const level = Number(event.currentTarget.value);
            event.currentTarget.value = "";
            editorRef.current?.applyHeading(level);
          }}
          className="h-7 appearance-none rounded-md border border-[var(--border)] bg-[var(--panel-2)] pl-2 pr-6 text-[11px] text-[var(--text-soft)] outline-none hover:border-[var(--muted)]"
          title="Tipo de encabezado"
        >
          <option value="">Párrafo</option>
          <option value="1">Título 1</option>
          <option value="2">Título 2</option>
          <option value="3">Título 3</option>
          <option value="4">Título 4</option>
          <option value="5">Título 5</option>
          <option value="6">Título 6</option>
        </select>
        <ChevronDown
          size={12}
          className="pointer-events-none absolute right-1.5 top-2 text-[var(--muted)]"
        />
      </label>

      <span className="mx-1 h-4 w-px shrink-0 bg-[var(--border)]" />

      <ToolButton label="Insertar etiqueta" onClick={() => openPanel("tag")}>
        <Hash size={14} />
      </ToolButton>
      <ToolButton label="Insertar enlace a nota" onClick={() => openPanel("note")}>
        <Link2 size={14} />
      </ToolButton>
      <ToolButton label="Subir archivo adjunto" onClick={() => fileInput.current?.click()}>
        <Paperclip size={14} />
      </ToolButton>

      <input
        ref={fileInput}
        type="file"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void uploadFile(file);
        }}
      />

      <span className="ml-auto hidden shrink-0 pr-1 text-[10px] text-[var(--muted)] md:block">
        Markdown · Ctrl+B / I / U
      </span>

      {panel ? (
        <>
          <button
            type="button"
            aria-label="Cerrar selector"
            className="fixed inset-0 z-40 cursor-default bg-black/10"
            onClick={() => setPanel(null)}
          />
          <div className="panel fixed right-3 top-[88px] z-50 w-72 overflow-hidden p-2 shadow-2xl">
            <div className="relative mb-2">
              <Search size={13} className="absolute left-2.5 top-2.5 text-[var(--muted)]" />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setPanel(null);
                  if (event.key === "Enter") {
                    if (panel === "tag" && query.trim()) insertTag(query);
                    if (panel === "note" && filteredNotes[0]) insertNote(filteredNotes[0]);
                  }
                }}
                placeholder={panel === "tag" ? "Buscar o escribir etiqueta…" : "Buscar nota…"}
                className="input h-8 pl-8 text-xs"
              />
            </div>

            <div className="scrollbar max-h-56 overflow-y-auto">
              {panel === "tag" ? (
                <>
                  {filteredTags.map((tag) => (
                    <button
                      key={tag.name}
                      type="button"
                      onClick={() => insertTag(tag.name)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-[var(--panel-2)]"
                    >
                      <Hash size={12} className="text-[var(--accent-2)]" />
                      <span className="flex-1 truncate">{tag.name}</span>
                      <span className="text-[10px] text-[var(--muted)]">{tag.count}</span>
                    </button>
                  ))}
                  {query.trim() &&
                  !filteredTags.some(
                    (tag) => tag.name.toLowerCase() === query.trim().toLowerCase(),
                  ) ? (
                    <button
                      type="button"
                      onClick={() => insertTag(query)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-[var(--accent-2)] hover:bg-[var(--panel-2)]"
                    >
                      <Hash size={12} /> Insertar #{query.trim()}
                    </button>
                  ) : null}
                  {filteredTags.length === 0 && !query.trim() ? (
                    <p className="px-2 py-4 text-center text-[11px] text-[var(--muted)]">
                      Todavía no hay etiquetas. Escribe una y pulsa Enter.
                    </p>
                  ) : null}
                </>
              ) : (
                <>
                  {filteredNotes.map((note) => (
                    <button
                      key={note.id}
                      type="button"
                      onClick={() => insertNote(note)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-[var(--panel-2)]"
                    >
                      <FileText size={12} className="shrink-0 text-[var(--accent-2)]" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{note.title}</span>
                        <span className="block truncate text-[9px] text-[var(--muted)]">
                          {note.path}
                        </span>
                      </span>
                    </button>
                  ))}
                  {filteredNotes.length === 0 ? (
                    <p className="px-2 py-4 text-center text-[11px] text-[var(--muted)]">
                      No hay notas que coincidan.
                    </p>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
