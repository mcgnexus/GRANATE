"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  wide = false,
  full = false,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  wide?: boolean;
  full?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;

    const focusFirst = () => {
      const panel = panelRef.current;
      if (!panel) return;
      const targets = panel.querySelectorAll<HTMLElement>(FOCUSABLE);
      (targets[0] ?? panel).focus();
    };
    const timer = window.setTimeout(focusFirst, 20);

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const targets = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (targets.length === 0) {
        event.preventDefault();
        return;
      }
      const first = targets[0];
      const last = targets[targets.length - 1];
      const active = document.activeElement;
      if (event.shiftKey) {
        if (active === first || !panel.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last || !panel.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKey, true);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKey, true);
      restoreRef.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Cerrar"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-black/65 backdrop-blur-sm"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title ? undefined : "Diálogo"}
        tabIndex={-1}
        className={`panel relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden shadow-2xl outline-none ${
          full
            ? "h-[92dvh] max-w-[1400px] sm:rounded-xl"
            : wide
              ? "max-w-4xl sm:rounded-xl"
              : "max-w-lg sm:rounded-xl"
        } max-sm:rounded-b-none max-sm:rounded-t-xl max-sm:border-b-0`}
      >
        {title ? (
          <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-5 py-4">
            <div>
              <h2 className="font-display text-xl">{title}</h2>
              {subtitle ? <p className="mt-1 text-xs text-[var(--muted)]">{subtitle}</p> : null}
            </div>
            <button type="button" onClick={onClose} className="btn btn-ghost h-8 w-8 p-0" aria-label="Cerrar">
              <X size={16} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost absolute right-3 top-3 z-20 h-8 w-8 p-0"
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        )}
        <div className="scrollbar min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
