"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export type MenuEntry =
  | {
      separator: true;
      key?: string;
    }
  | {
      separator?: false;
      key?: string;
      label: string;
      icon?: React.ReactNode;
      onClick: () => void;
      danger?: boolean;
      disabled?: boolean;
      shortcut?: string;
    };

export function ContextMenu({
  x,
  y,
  entries,
  onClose,
}: {
  x: number;
  y: number;
  entries: MenuEntry[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointer = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", onPointer, true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onClose);
    window.addEventListener("scroll", onClose, true);
    return () => {
      window.removeEventListener("mousedown", onPointer, true);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [onClose]);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    if (rect.right > window.innerWidth - 8) {
      node.style.left = `${Math.max(8, window.innerWidth - rect.width - 8)}px`;
    }
    if (rect.bottom > window.innerHeight - 8) {
      node.style.top = `${Math.max(8, window.innerHeight - rect.height - 8)}px`;
    }
  }, [x, y]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={ref}
      role="menu"
      className="panel fixed z-[70] min-w-52 overflow-hidden p-1 shadow-2xl"
      style={{ left: x, top: y }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {entries.map((entry, index) =>
        entry.separator ? (
          <div
            key={entry.key ?? `sep-${index}`}
            className="my-1 border-t border-[var(--border-soft)]"
          />
        ) : (
          <button
            key={entry.key ?? entry.label}
            type="button"
            role="menuitem"
            disabled={entry.disabled}
            onClick={() => {
              onClose();
              entry.onClick();
            }}
            className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[11.5px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              entry.danger
                ? "text-[var(--accent-2)] hover:bg-[var(--accent-soft)]"
                : "text-[var(--text-soft)] hover:bg-[var(--panel-2)]"
            }`}
          >
            <span className="grid h-4 w-4 place-items-center text-[var(--muted)]">
              {entry.icon}
            </span>
            <span className="flex-1">{entry.label}</span>
            {entry.shortcut ? (
              <span className="text-[9px] text-[var(--muted)]">{entry.shortcut}</span>
            ) : null}
          </button>
        ),
      )}
    </div>,
    document.body,
  );
}
