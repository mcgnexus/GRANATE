"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ChevronRight, X } from "lucide-react";
import type { MenuEntry } from "./context-menu";

type Level = { title: string; entries: MenuEntry[] };

/**
 * Variante táctil del menú contextual: lámina inferior con navegación por
 * niveles (en vez de submenús flotantes) y filas de 44px mínimo.
 * La apertura es siempre explícita (botón); este componente no intercepta
 * gestos de selección.
 */
export function ContextBottomSheet({
  title,
  entries,
  onClose,
}: {
  title: string;
  entries: MenuEntry[];
  onClose: () => void;
}) {
  const [stack, setStack] = useState<Level[]>([{ title, entries }]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  const current = stack[stack.length - 1];
  const canGoBack = stack.length > 1;

  return createPortal(
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label={current.title}>
      <button
        type="button"
        aria-label="Cerrar menú"
        className="absolute inset-0 cursor-default bg-black/40"
        onClick={onClose}
      />
      <div
        className="panel safe-bottom absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col rounded-b-none rounded-t-2xl shadow-2xl"
        onContextMenu={(event) => event.preventDefault()}
      >
        <div className="shrink-0 px-4 pb-1 pt-2">
          <div className="mx-auto h-1 w-10 rounded-full bg-[var(--border)]" />
        </div>
        <div className="flex shrink-0 items-center gap-1 px-2 py-1">
          {canGoBack ? (
            <button
              type="button"
              aria-label="Volver"
              onClick={() => setStack((previous) => previous.slice(0, -1))}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-[var(--text-soft)] hover:bg-[var(--panel-2)]"
            >
              <ArrowLeft size={18} />
            </button>
          ) : null}
          <p className="min-w-0 flex-1 truncate px-2 text-center text-sm font-medium text-[var(--text)]">
            {current.title}
          </p>
          <button
            type="button"
            aria-label="Cerrar menú"
            onClick={onClose}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-[var(--text-soft)] hover:bg-[var(--panel-2)]"
          >
            <X size={18} />
          </button>
        </div>
        <div className="scrollbar min-h-0 overflow-y-auto px-2 pb-4">
          {current.entries.map((entry, index) => {
            if (entry.separator) {
              return (
                <div
                  key={entry.key ?? `sep-${index}`}
                  className="my-1 border-t border-[var(--border-soft)]"
                />
              );
            }
            const children = entry.children;
            const hasChildren = Boolean(children?.length);
            return (
              <button
                key={entry.key ?? entry.label}
                type="button"
                role="menuitem"
                aria-haspopup={hasChildren || undefined}
                disabled={entry.disabled}
                onClick={() => {
                  if (hasChildren && children) {
                    setStack((previous) => [
                      ...previous,
                      { title: entry.label, entries: children },
                    ]);
                    return;
                  }
                  onClose();
                  entry.onClick?.();
                }}
                className={`flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  entry.danger
                    ? "text-[var(--accent-2)] hover:bg-[var(--accent-soft)]"
                    : "text-[var(--text-soft)] hover:bg-[var(--panel-2)]"
                }`}
              >
                <span className="grid h-5 w-5 shrink-0 place-items-center text-[var(--muted)]">
                  {entry.icon}
                </span>
                <span className="min-w-0 flex-1">{entry.label}</span>
                {hasChildren ? (
                  <ChevronRight size={16} className="shrink-0 text-[var(--muted)]" />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}
