"use client";

import { useMemo, useState } from "react";
import { Folder, FolderInput, Home, Search } from "lucide-react";
import { Modal } from "@/components/ui/modal";

export function FolderPicker({
  open,
  onClose,
  folders,
  currentPath,
  title = "Mover a…",
  description,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  folders: string[];
  currentPath?: string;
  title?: string;
  description?: string;
  onSelect: (folderPath: string) => void;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return folders
      .filter((folder) => folder && (!needle || folder.toLowerCase().includes(needle)))
      .sort((a, b) => a.localeCompare(b, "es"));
  }, [folders, query]);

  function choose(path: string) {
    onSelect(path);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={title} subtitle={description}>
      <div className="space-y-3 p-4">
        <label className="relative block">
          <Search
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--muted)]"
          />
          <input
            className="input h-9 pl-8 text-xs"
            placeholder="Buscar carpeta…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoFocus
          />
        </label>

        <div className="max-h-[52vh] overflow-y-auto rounded-lg border border-[var(--border)]">
          <button
            type="button"
            onClick={() => choose("")}
            className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-[var(--panel-2)] ${
              !currentPath ? "text-[var(--accent-2)]" : "text-[var(--text-soft)]"
            }`}
          >
            <Home size={14} className="text-[var(--muted)]" />
            <span className="flex-1">Raíz de la bóveda</span>
            {!currentPath ? <span className="text-[10px]">actual</span> : null}
          </button>

          {filtered.map((folder) => {
            const depth = folder.split("/").length - 1;
            const active = currentPath?.toLowerCase() === folder.toLowerCase();
            return (
              <button
                key={folder}
                type="button"
                onClick={() => choose(folder)}
                className={`flex w-full items-center gap-2 border-t border-[var(--border-soft)] px-3 py-2 text-left text-xs transition-colors hover:bg-[var(--panel-2)] ${
                  active ? "text-[var(--accent-2)]" : "text-[var(--text-soft)]"
                }`}
                style={{ paddingLeft: `${12 + depth * 14}px` }}
              >
                <Folder size={14} className="text-[var(--gold)]" />
                <span className="min-w-0 flex-1 truncate">{folder.split("/").pop()}</span>
                <span className="max-w-[55%] truncate text-[9px] text-[var(--muted)]">
                  {folder}
                </span>
              </button>
            );
          })}

          {filtered.length === 0 ? (
            <p className="border-t border-[var(--border-soft)] px-3 py-5 text-center text-[11px] text-[var(--muted)]">
              No hay carpetas que coincidan.
            </p>
          ) : null}
        </div>

        <p className="flex items-center gap-1.5 text-[10px] text-[var(--muted)]">
          <FolderInput size={12} /> La nota conserva su nombre; si ya existe una igual, se avisa y no
          se sobrescribe.
        </p>
      </div>
    </Modal>
  );
}
