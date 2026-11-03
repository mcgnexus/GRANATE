"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

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
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="absolute inset-0 bg-black/65 backdrop-blur-sm"
      />
      <div
        className={`panel relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden shadow-2xl ${
          full ? "h-[92dvh] max-w-[1400px]" : wide ? "max-w-4xl" : "max-w-lg"
        }`}
      >
        {title ? (
          <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-5 py-4">
            <div>
              <h2 className="font-display text-xl">{title}</h2>
              {subtitle ? <p className="mt-1 text-xs text-[var(--muted)]">{subtitle}</p> : null}
            </div>
            <button type="button" onClick={onClose} className="btn btn-ghost h-8 w-8 p-0">
              <X size={16} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost absolute right-3 top-3 z-20 h-8 w-8 p-0"
          >
            <X size={16} />
          </button>
        )}
        <div className="scrollbar min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
