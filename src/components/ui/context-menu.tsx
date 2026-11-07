"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronRight } from "lucide-react";

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
      /** Acción de la entrada hoja. Si hay `children`, se ignora. */
      onClick?: () => void;
      /** Submenú que se abre al pasar el ratón o hacer clic. */
      children?: MenuEntry[];
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
    // El scroll *dentro* del menú (que es scrollable) no debe cerrarlo; solo el
    // scroll del resto de la página.
    const onScroll = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && ref.current?.contains(target)) return;
      onClose();
    };
    window.addEventListener("mousedown", onPointer, true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onClose);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("mousedown", onPointer, true);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [onClose]);

  useLayoutEffect(() => {
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
      className="panel fixed z-[80] max-h-[min(26rem,calc(100vh-16px))] min-w-52 overflow-y-auto p-1 shadow-2xl"
      style={{ left: x, top: y }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <MenuList entries={entries} onClose={onClose} />
    </div>,
    document.body,
  );
}

function MenuList({
  entries,
  onClose,
}: {
  entries: MenuEntry[];
  onClose: () => void;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);

  return (
    <>
      {entries.map((entry, index) =>
        entry.separator ? (
          <div
            key={entry.key ?? `sep-${index}`}
            className="my-1 border-t border-[var(--border-soft)]"
          />
        ) : (
          <MenuRow
            key={entry.key ?? entry.label}
            entry={entry}
            open={openKey === (entry.key ?? entry.label)}
            setOpen={(open) => setOpenKey(open ? entry.key ?? entry.label : null)}
            onClose={onClose}
          />
        ),
      )}
    </>
  );
}

function MenuRow({
  entry,
  open,
  setOpen,
  onClose,
}: {
  entry: Extract<MenuEntry, { separator?: false }>;
  open: boolean;
  setOpen: (open: boolean) => void;
  onClose: () => void;
}) {
  const children = entry.children;
  const hasChildren = Boolean(children?.length);
  const wrapperRef = useRef<HTMLDivElement>(null);

  return (
    // El submenú se renderiza dentro de este wrapper para que el puntero siga
    // "dentro" de la fila y no se cierre al moverse hacia él.
    <div
      ref={wrapperRef}
      className="relative"
      onPointerEnter={(event) => {
        // Solo el ratón abre por hover: en táctil el `mouseenter` sintético
        // seguido del clic alternaría el estado y el submenú nunca quedaría
        // abierto.
        if (event.pointerType === "mouse") setOpen(hasChildren);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") setOpen(false);
      }}
    >
      <button
        type="button"
        role="menuitem"
        aria-haspopup={hasChildren || undefined}
        aria-expanded={hasChildren ? open : undefined}
        disabled={entry.disabled}
        onClick={() => {
          if (hasChildren) {
            setOpen(!open);
            return;
          }
          onClose();
          entry.onClick?.();
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
        {entry.shortcut && !hasChildren ? (
          <span className="text-[9px] text-[var(--muted)]">{entry.shortcut}</span>
        ) : null}
        {hasChildren ? <ChevronRight size={12} className="text-[var(--muted)]" /> : null}
      </button>
      {children && open ? (
        <SubmenuPanel anchor={wrapperRef} entries={children} onClose={onClose} />
      ) : null}
    </div>
  );
}

function SubmenuPanel({
  anchor,
  entries,
  onClose,
}: {
  anchor: React.RefObject<HTMLDivElement | null>;
  entries: MenuEntry[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({ visibility: "hidden" });

  const position = () => {
    const node = ref.current;
    const anchorNode = anchor.current;
    if (!node || !anchorNode) return;
    const rect = node.getBoundingClientRect();
    const anchorRect = anchorNode.getBoundingClientRect();
    // `position: fixed` evade el `overflow` del panel raíz (que recortaría un
    // submenú `absolute`), así que la posición se calcula contra el viewport.
    let left: number;
    if (anchorRect.right + rect.width <= window.innerWidth - 8) {
      left = anchorRect.right;
    } else if (anchorRect.left - rect.width >= 8) {
      left = anchorRect.left - rect.width;
    } else {
      // No cabe a ningún lado (pantallas estrechas): al borde derecho,
      // solapando un poco el menú raíz en vez de salirse del viewport.
      left = Math.max(8, Math.min(anchorRect.right, window.innerWidth - 8 - rect.width));
    }
    let top = anchorRect.top;
    if (top + rect.height > window.innerHeight - 8) {
      top = window.innerHeight - 8 - rect.height;
    }
    if (top < 8) top = 8;
    setStyle((prev) =>
      prev.left === left && prev.top === top && prev.visibility === "visible"
        ? prev
        : { left, top, visibility: "visible" },
    );
  };

  // Tras cada render (p. ej. cuando un ancestro se reubica) y ante scroll/resize.
  useLayoutEffect(() => {
    position();
  });
  useEffect(() => {
    window.addEventListener("scroll", position, true);
    window.addEventListener("resize", position);
    return () => {
      window.removeEventListener("scroll", position, true);
      window.removeEventListener("resize", position);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={ref}
      role="menu"
      className="panel fixed z-[81] max-h-[min(20rem,calc(100vh-16px))] min-w-44 overflow-y-auto p-1 shadow-2xl"
      style={style}
      onContextMenu={(event) => event.preventDefault()}
    >
      <MenuList entries={entries} onClose={onClose} />
    </div>
  );
}
