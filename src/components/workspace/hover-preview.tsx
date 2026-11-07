"use client";

import { useEffect, useRef, useState } from "react";
import { FileText } from "lucide-react";

export function HoverPreview({ vaultId, path, children }: { vaultId: string; path: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setContent(null);
    fetch(`/api/v1/vaults/${vaultId}/notes?path=${encodeURIComponent(path.endsWith(".md") ? path : `${path}.md`)}`)
      .then(async (response) => {
        if (!response.ok) return null;
        const data = (await response.json()) as { note?: { content?: string } };
        return data.note?.content ?? null;
      })
      .then((result) => {
        if (cancelled) return;
        setContent(result);
        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, vaultId, path]);

  const show = () => { window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setOpen(true), 350); };
  const hide = () => { window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setOpen(false), 150); };

  const preview = (content ?? "").slice(0, 420);
  return (
    <span className="relative inline-block" onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {children}
      {open ? (
        <span role="tooltip" className="pointer-events-none absolute left-0 top-full z-50 mt-1 w-72 rounded-lg border border-[var(--border)] bg-[var(--panel)] p-3 text-[11px] leading-5 text-[var(--text-soft)] shadow-2xl" onMouseEnter={() => window.clearTimeout(timer.current)} onMouseLeave={hide}>
          <span className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">
            <FileText size={11} /> Vista previa
          </span>
          {loading ? <span className="text-[var(--muted)]">Cargando...</span> : preview ? <span className="block whitespace-pre-wrap break-words">{preview}</span> : <span className="text-[var(--muted)]">Sin contenido.</span>}
        </span>
      ) : null}
    </span>
  );
}
