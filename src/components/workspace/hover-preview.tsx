"use client";

import { useEffect, useRef, useState } from "react";
import { FileText } from "lucide-react";

function PreviewPopover({
  vaultId,
  path,
  onKeep,
  onDismiss,
}: {
  vaultId: string;
  path: string;
  onKeep: () => void;
  onDismiss: () => void;
}) {
  const [content, setContent] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/v1/vaults/${vaultId}/notes?path=${encodeURIComponent(path.endsWith(".md") ? path : `${path}.md`)}`)
      .then(async (response) => {
        if (!response.ok) return null;
        const data = (await response.json()) as { note?: { content?: string } };
        return data.note?.content ?? null;
      })
      .then((result) => {
        if (cancelled) return;
        if (result === null) setFailed(true);
        else setContent(result);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [vaultId, path]);

  const preview = (content ?? "").slice(0, 420);
  return (
    <span
      role="tooltip"
      className="pointer-events-none absolute left-0 top-full z-[60] mt-1 w-72 rounded-lg border border-[var(--border)] bg-[var(--panel)] p-3 text-[11px] leading-5 text-[var(--text-soft)] shadow-2xl"
      onMouseEnter={onKeep}
      onMouseLeave={onDismiss}
    >
      <span className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">
        <FileText size={11} aria-hidden="true" /> Vista previa
      </span>
      {failed ? (
        <span className="text-[var(--muted)]">Sin contenido.</span>
      ) : content === null ? (
        <span className="text-[var(--muted)]">Cargando…</span>
      ) : (
        <span className="block whitespace-pre-wrap break-words">{preview}</span>
      )}
    </span>
  );
}

export function HoverPreview({
  vaultId,
  path,
  children,
}: {
  vaultId: string;
  path: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const show = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(true), 350);
  };
  const hide = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(false), 150);
  };

  useEffect(() => {
    return () => window.clearTimeout(timer.current);
  }, []);

  return (
    <span
      className="relative inline-block"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {open ? <PreviewPopover vaultId={vaultId} path={path} onKeep={show} onDismiss={hide} /> : null}
    </span>
  );
}
