"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Command, Search } from "lucide-react";
import { Modal } from "@/components/ui/modal";

export type CommandEntry = {
  id: string;
  label: string;
  group?: string;
  shortcut?: string;
  run: () => void;
};

function CommandPaletteInner({
  onClose,
  commands,
}: {
  onClose: () => void;
  commands: CommandEntry[];
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    window.setTimeout(() => inputRef.current?.focus(), 20);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((command) => command.label.toLowerCase().includes(q));
  }, [commands, query]);

  return (
    <Modal open onClose={onClose} title="Paleta de comandos" subtitle="Escribe para filtrar">
      <div className="p-4">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-3 text-[var(--muted)]" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            aria-label="Paleta de comandos"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar comando…"
            className="input pl-9"
            onKeyDown={(event) => {
              if (event.key === "Enter" && filtered[0]) {
                filtered[0].run();
                onClose();
              }
            }}
          />
        </div>
        <div className="scrollbar mt-3 max-h-[55dvh] space-y-0.5 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-[var(--muted)]">Sin comandos.</p>
          ) : (
            filtered.map((command) => (
              <button
                key={command.id}
                type="button"
                onClick={() => {
                  command.run();
                  onClose();
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--panel-2)]"
              >
                <Command size={13} className="shrink-0 text-[var(--muted)]" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{command.label}</span>
                {command.group ? <span className="chip text-[9px]">{command.group}</span> : null}
                {command.shortcut ? (
                  <span className="text-[10px] text-[var(--muted)]">{command.shortcut}</span>
                ) : null}
              </button>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
}

export function CommandPalette({
  open,
  onClose,
  commands,
}: {
  open: boolean;
  onClose: () => void;
  commands: CommandEntry[];
}) {
  if (!open) return null;
  return <CommandPaletteInner onClose={onClose} commands={commands} />;
}
