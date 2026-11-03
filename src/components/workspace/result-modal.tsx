"use client";

import { Modal } from "@/components/ui/modal";

export function ResultModal({
  open,
  onClose,
  title,
  original,
  result,
  onApply,
  applyLabel = "Aplicar cambios",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  original?: string;
  result: string;
  onApply?: () => void;
  applyLabel?: string;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} wide>
      <div className="space-y-4 p-5">
        {original !== undefined ? (
          <div className="grid gap-3 lg:grid-cols-2">
            <div>
              <div className="mb-1.5 text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">
                Original
              </div>
              <pre className="scrollbar max-h-[45dvh] overflow-auto whitespace-pre-wrap rounded-lg border border-[var(--border)] bg-[var(--panel-2)] p-3 text-[11px] leading-5 text-[var(--text-soft)]">
                {original}
              </pre>
            </div>
            <div>
              <div className="mb-1.5 text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">
                Propuesta
              </div>
              <pre className="scrollbar max-h-[45dvh] overflow-auto whitespace-pre-wrap rounded-lg border border-[var(--accent)]/40 bg-[var(--accent-soft)] p-3 text-[11px] leading-5 text-[var(--text)]">
                {result}
              </pre>
            </div>
          </div>
        ) : (
          <pre className="scrollbar max-h-[55dvh] overflow-auto whitespace-pre-wrap rounded-lg border border-[var(--border)] bg-[var(--panel-2)] p-4 text-xs leading-6 text-[var(--text-soft)]">
            {result}
          </pre>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={onClose}>
            Cerrar
          </button>
          {onApply ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                onApply();
                onClose();
              }}
            >
              {applyLabel}
            </button>
          ) : null}
        </div>
        <p className="text-[10px] leading-5 text-[var(--muted)]">
          El LLM no modifica nada sin tu confirmación. Revisa la propuesta antes de aplicarla.
        </p>
      </div>
    </Modal>
  );
}
