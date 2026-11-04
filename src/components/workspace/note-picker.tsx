"use client";

import { useRef, useState } from "react";
import { FileText, Search } from "lucide-react";
import type { TreeNote } from "./file-tree";

/**
 * Selector flotante de notas con búsqueda, compartido por la barra de herramientas
 * del editor y el menú contextual. La posición se inyecta con `positionClass`
 * porque cada consumidor lo ancla a un sitio distinto.
 */
export function NotePicker({
  notes,
  activeNoteId,
  positionClass,
  onPick,
  onClose,
}: {
  notes: TreeNote[];
  activeNoteId?: string;
  /** Clases Tailwind para posicionar el panel (fixed). */
  positionClass: string;
  onPick: (note: TreeNote) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredNotes = notes
    .filter((note) => note.id !== activeNoteId)
    .filter((note) => {
      const search = query.trim().toLowerCase();
      if (!search) return true;
      return note.title.toLowerCase().includes(search) || note.path.toLowerCase().includes(search);
    })
    .slice(0, 10);

  return (
    <>
      <button
        type="button"
        aria-label="Cerrar selector"
        className="fixed inset-0 z-[60] cursor-default bg-black/10"
        onClick={onClose}
      />
      <div className={`panel fixed z-[61] w-72 overflow-hidden p-2 shadow-2xl ${positionClass}`}>
        <div className="relative mb-2">
          <Search size={13} className="absolute left-2.5 top-2.5 text-[var(--muted)]" />
          <input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") onClose();
              if (event.key === "Enter" && filteredNotes[0]) onPick(filteredNotes[0]);
            }}
            placeholder="Buscar nota…"
            className="input h-8 pl-8 text-xs"
          />
        </div>

        <div className="scrollbar max-h-56 overflow-y-auto">
          {filteredNotes.map((note) => (
            <button
              key={note.id}
              type="button"
              onClick={() => onPick(note)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-[var(--panel-2)]"
            >
              <FileText size={12} className="shrink-0 text-[var(--accent-2)]" />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{note.title}</span>
                <span className="block truncate text-[9px] text-[var(--muted)]">{note.path}</span>
              </span>
            </button>
          ))}
          {filteredNotes.length === 0 ? (
            <p className="px-2 py-4 text-center text-[11px] text-[var(--muted)]">
              No hay notas que coincidan.
            </p>
          ) : null}
        </div>
      </div>
    </>
  );
}
