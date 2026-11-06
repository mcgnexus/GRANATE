"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, Loader2, Search } from "lucide-react";
import { Modal } from "@/components/ui/modal";

type Hit = {
  id: string;
  path: string;
  title: string;
  snippet: string;
  source: "fulltext" | "semantic" | "title";
};

function isAbort(error: unknown) {
  if (error instanceof DOMException) return error.name === "AbortError";
  return error instanceof Error && error.name === "AbortError";
}

export function SearchDialog({
  open,
  onClose,
  vaultId,
  onOpenNote,
  initialQuery = "",
}: {
  open: boolean;
  onClose: () => void;
  vaultId: string;
  onOpenNote: (path: string) => void;
  initialQuery?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const runId = useRef(0);

  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 20);
  }, [open]);

  const queryReady = query.trim().length >= 2;

  useEffect(() => {
    if (!open || !queryReady) {
      return;
    }
    const controller = new AbortController();
    const currentRun = ++runId.current;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      setHits([]);
      try {
        const response = await fetch(
          `/api/v1/vaults/${vaultId}/search?q=${encodeURIComponent(query)}&limit=20`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error("search failed");
        const data = (await response.json()) as { hits?: Hit[] };
        setHits(data.hits ?? []);
      } catch (caught) {
        if (isAbort(caught)) return;
        setError("No se pudo completar la búsqueda. Comprueba tu conexión e inténtalo de nuevo.");
      } finally {
        if (runId.current === currentRun) setLoading(false);
      }
    }, 220);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query, queryReady, open, vaultId]);

  return (
    <Modal open={open} onClose={onClose} title="Buscar en la bóveda" subtitle="Full-text + semántica">
      <div className="p-4">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-3 text-[var(--muted)]" aria-hidden="true" />
          <input
            ref={inputRef}
            type="search"
            aria-label="Buscar en la bóveda"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Busca una idea, una ruta o una etiqueta…"
            className="input pl-9"
          />
          {loading ? (
            <Loader2 size={15} className="absolute right-3 top-3 animate-spin text-[var(--muted)]" aria-hidden="true" />
          ) : null}
        </div>

        <div aria-live="polite">
          {error && queryReady ? (
            <p className="px-3 py-8 text-center text-xs leading-5 text-red-400">{error}</p>
          ) : null}
        </div>

        <div className="scrollbar mt-4 max-h-[55dvh] space-y-1 overflow-y-auto">
          {!error && queryReady
            ? hits.map((hit) => (
            <button
              key={`${hit.id}-${hit.source}`}
              type="button"
              onClick={() => {
                onOpenNote(hit.path);
                onClose();
              }}
              className="w-full rounded-lg border border-transparent px-3 py-2.5 text-left transition-colors hover:border-[var(--border)] hover:bg-[var(--panel-2)]"
            >
              <div className="flex items-center gap-2">
                <FileText size={13} className="text-[var(--accent-2)]" aria-hidden="true" />
                <span className="truncate text-sm">{hit.title}</span>
                <span className="ml-auto chip text-[9px]">
                  {hit.source === "semantic" ? "semántica" : hit.source === "fulltext" ? "texto" : "título"}
                </span>
              </div>
              <div className="mt-1 truncate text-[11px] text-[var(--muted)]">{hit.path}</div>
              {hit.snippet ? (
                <p className="mt-1.5 line-clamp-2 text-[11px] leading-5 text-[var(--text-soft)]">
                  {hit.snippet}
                </p>
              ) : null}
            </button>
              ))
            : null}

          {!loading && !error && queryReady && hits.length === 0 ? (
            <p className="px-3 py-8 text-center text-xs text-[var(--muted)]">
              Sin resultados. Prueba otra palabra o activa embeddings.
            </p>
          ) : null}
          {!queryReady ? (
            <p className="px-3 py-8 text-center text-xs text-[var(--muted)]">
              Escribe al menos 2 caracteres. Se buscan títulos, contenido y significado.
            </p>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
