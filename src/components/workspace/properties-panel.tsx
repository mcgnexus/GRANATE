"use client";

import { useCallback, useEffect, useState } from "react";
import { Braces, ChevronDown, ChevronRight } from "lucide-react";
import { Modal } from "@/components/ui/modal";

type PropertyEntry = { key: string; count: number; notes: Array<{ id: string; path: string }> };

function PropertiesPanelInner({
  onClose,
  vaultId,
  onOpenNote,
}: {
  onClose: () => void;
  vaultId: string;
  onOpenNote: (path: string) => void;
}) {
  const [properties, setProperties] = useState<PropertyEntry[] | null>(null);
  const [openKeys, setOpenKeys] = useState<Set<string>>(new Set());
  const [error, setError] = useState(false);

  const loadProperties = useCallback(() => {
    setError(false);
    setProperties(null);
    fetch(`/api/v1/vaults/${vaultId}/properties`)
      .then(async (r) => {
        if (!r.ok) throw new Error("properties");
        const data = (await r.json()) as { properties?: PropertyEntry[] };
        return data.properties ?? [];
      })
      .then((result) => setProperties(result))
      .catch(() => setError(true));
  }, [vaultId]);

  useEffect(() => {
    const timer = window.setTimeout(loadProperties, 0);
    return () => window.clearTimeout(timer);
  }, [loadProperties]);

  return (
    <Modal open onClose={onClose} title="Propiedades de la bóveda" subtitle="Todas las claves de frontmatter">
      <div className="p-4">
        {error ? (
          <div className="px-3 py-6 text-center">
            <p className="text-xs text-[var(--muted)]">No se pudieron cargar las propiedades.</p>
            <button type="button" onClick={loadProperties} className="btn btn-ghost mx-auto mt-2 h-7 px-3 text-xs">
              Reintentar
            </button>
          </div>
        ) : properties === null ? (
          <p className="px-3 py-6 text-center text-xs text-[var(--muted)]">Cargando…</p>
        ) : properties.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-[var(--muted)]">Sin propiedades.</p>
        ) : (
          <div className="space-y-1">
            {properties.map((entry) => {
              const isOpen = openKeys.has(entry.key);
              return (
                <div key={entry.key} className="rounded-md border border-[var(--border-soft)]">
                  <button
                    type="button"
                    onClick={() =>
                      setOpenKeys((prev) => {
                        const next = new Set(prev);
                        if (next.has(entry.key)) next.delete(entry.key);
                        else next.add(entry.key);
                        return next;
                      })
                    }
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--panel-2)]"
                  >
                    {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    <Braces size={13} className="text-[var(--accent-2)]" />
                    <span className="min-w-0 flex-1 truncate">{entry.key}</span>
                    <span className="text-[10px] text-[var(--muted)]">{entry.count}</span>
                  </button>
                  {isOpen ? (
                    <div className="border-t border-[var(--border-soft)] px-3 py-2">
                      {entry.notes.map((note) => (
                        <button
                          key={note.id}
                          type="button"
                          onClick={() => {
                            onOpenNote(note.path);
                            onClose();
                          }}
                          className="block w-full truncate rounded px-2 py-1 text-left text-[11px] text-[var(--text-soft)] hover:bg-[var(--panel-2)]"
                        >
                          {note.path}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}

export function PropertiesPanel({
  open,
  onClose,
  vaultId,
  onOpenNote,
}: {
  open: boolean;
  onClose: () => void;
  vaultId: string;
  onOpenNote: (path: string) => void;
}) {
  if (!open) return null;
  return <PropertiesPanelInner onClose={onClose} vaultId={vaultId} onOpenNote={onOpenNote} />;
}
