"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, Plus } from "lucide-react";
import { Modal } from "@/components/ui/modal";

type Note = { id: string; path: string; title?: string };

function QuickSwitcherInner({
  onClose,
  vaultId,
  onOpenNote,
  onCreateNote,
}: {
  onClose: () => void;
  vaultId: string;
  onOpenNote: (path: string) => void;
  onCreateNote: (path: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [notes, setNotes] = useState<Note[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    window.setTimeout(() => inputRef.current?.focus(), 20);
    let cancelled = false;
    fetch(`/api/v1/vaults/${vaultId}/tree`)
      .then(async (r) => {
        if (!r.ok) return [] as Note[];
        const data = (await r.json()) as { notes?: Note[] };
        return data.notes ?? [];
      })
      .then((result) => {
        if (!cancelled) setNotes(result);
      })
      .catch(() => {
        if (!cancelled) setNotes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [vaultId]);

  const matches = query.trim()
    ? (notes ?? [])
        .map((note) => {
          const haystack = `${note.title ?? ""} ${note.path}`.toLowerCase();
          const q = query.toLowerCase();
          const score = haystack.includes(q) ? (note.path.toLowerCase().startsWith(q) ? 2 : 1) : 0;
          return { note, score };
        })
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((item) => item.note)
    : (notes ?? []).slice(0, 12);

  const exact = (notes ?? []).some((note) => note.path.toLowerCase() === `${query.trim().toLowerCase()}.md`);

  return (
    <Modal open onClose={onClose} title="Cambiar de nota" subtitle="Escribe para filtrar o crear">
      <div className="p-4">
        <input
          ref={inputRef}
          type="text"
          aria-label="Cambiar de nota"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Nombre de nota o ruta…"
          className="input"
          onKeyDown={(event) => {
            if (event.key === "Enter" && matches[0]) {
              onOpenNote(matches[0].path);
              onClose();
            } else if (event.key === "Enter" && query.trim() && !exact) {
              onCreateNote(query.trim());
              onClose();
            }
          }}
        />
        <div className="scrollbar mt-3 max-h-[50dvh] space-y-0.5 overflow-y-auto">
          {!exact && query.trim() ? (
            <button
              type="button"
              onClick={() => {
                onCreateNote(query.trim());
                onClose();
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--panel-2)]"
            >
              <Plus size={13} className="text-[var(--accent-2)]" />
              <span>Crear «{query.trim()}»</span>
            </button>
          ) : null}
          {notes === null ? (
            <p className="px-3 py-6 text-center text-xs text-[var(--muted)]">Cargando…</p>
          ) : matches.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-[var(--muted)]">Sin coincidencias.</p>
          ) : (
            matches.slice(0, 24).map((note) => (
              <button
                key={note.id}
                type="button"
                onClick={() => {
                  onOpenNote(note.path);
                  onClose();
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--panel-2)]"
              >
                <FileText size={13} className="shrink-0 text-[var(--muted)]" />
                <span className="min-w-0 flex-1 truncate">{note.path}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
}

export function QuickSwitcher({
  open,
  onClose,
  vaultId,
  onOpenNote,
  onCreateNote,
}: {
  open: boolean;
  onClose: () => void;
  vaultId: string;
  onOpenNote: (path: string) => void;
  onCreateNote: (path: string) => void;
}) {
  if (!open) return null;
  return (
    <QuickSwitcherInner onClose={onClose} vaultId={vaultId} onOpenNote={onOpenNote} onCreateNote={onCreateNote} />
  );
}
