"use client";

import { useRef, useState } from "react";
import { FileArchive, Loader2, UploadCloud } from "lucide-react";
import { Modal } from "@/components/ui/modal";

type Report = {
  notes: number;
  attachments: number;
  canvases: number;
  bases: number;
  skipped: number;
  unresolvedLinks: number;
};

export function ImportDialog({
  open,
  onClose,
  vaultId,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  vaultId: string;
  onImported: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload() {
    if (!file) return;
    setLoading(true);
    setError("");
    setReport(null);
    try {
      const data = new FormData();
      data.append("file", file);
      const response = await fetch(`/api/v1/vaults/${vaultId}/import`, {
        method: "POST",
        body: data,
      });
      const json = (await response.json()) as { report?: Report; error?: string };
      if (!response.ok) throw new Error(json.error ?? "No se pudo importar");
      setReport(json.report ?? null);
      onImported();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Error al importar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Importar bóveda de Obsidian"
      subtitle="Sube un ZIP con tus notas, adjuntos, canvas y .base"
    >
      <div className="space-y-4 p-5">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border)] bg-[var(--panel-2)] px-4 py-10 text-center transition-colors hover:border-[var(--accent)]"
        >
          <UploadCloud size={28} className="text-[var(--accent-2)]" />
          <span className="text-sm">{file ? file.name : "Elige un archivo .zip"}</span>
          <span className="text-[11px] text-[var(--muted)]">
            Se conservan rutas, frontmatter, enlaces, canvas y adjuntos. Máx. 20 MB por ZIP.
          </span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".zip,application/zip"
          className="hidden"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />

        {error ? (
          <p className="rounded-lg border border-[var(--accent)]/40 bg-[var(--accent-soft)] p-3 text-xs text-[var(--accent-2)]">
            {error}
          </p>
        ) : null}

        {report ? (
          <div className="rounded-lg border border-[var(--green)]/40 bg-[var(--green)]/10 p-3 text-xs leading-6 text-[var(--text-soft)]">
            <div className="flex items-center gap-2 font-medium">
              <FileArchive size={14} /> Importación completada
            </div>
            <ul className="mt-2 grid grid-cols-2 gap-x-4">
              <li>Notas: {report.notes}</li>
              <li>Adjuntos: {report.attachments}</li>
              <li>Canvas: {report.canvases}</li>
              <li>Bases: {report.bases}</li>
              <li>Omitidos: {report.skipped}</li>
              <li>Enlaces sin resolver: {report.unresolvedLinks}</li>
            </ul>
          </div>
        ) : null}

        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={onClose}>
            Cerrar
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={upload}
            disabled={!file || loading}
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <UploadCloud size={15} />}
            Importar
          </button>
        </div>
      </div>
    </Modal>
  );
}
