"use client";

import { useCallback, useEffect, useState } from "react";
import { diffLines } from "diff";
import { Loader2, RotateCcw } from "lucide-react";
import { useDialogs } from "@/components/ui/confirm-dialog";
import { Modal } from "@/components/ui/modal";

type Version = {
  id: string;
  source: string;
  createdAt: string;
  contentHash: string;
};

const SOURCE_LABELS: Record<string, string> = {
  save: "guardado",
  import: "importación",
  llm: "IA",
  restore: "restauración",
  api: "API",
};

export function VersionHistory({
  open,
  onClose,
  vaultId,
  noteId,
  notePath,
  currentContent,
  onRestored,
}: {
  open: boolean;
  onClose: () => void;
  vaultId: string;
  noteId: string;
  notePath: string;
  currentContent: string;
  onRestored: () => void;
}) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState("");
  const [base, setBase] = useState("");
  const [mode, setMode] = useState<"current" | "previous">("current");
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const { confirm, dialogNode } = useDialogs();

  const loadVersions = useCallback(async () => {
    const response = await fetch(`/api/v1/vaults/${vaultId}/notes/${noteId}/versions`);
    if (!response.ok) return;
    const data = (await response.json()) as { versions: Version[] };
    setVersions(data.versions ?? []);
    setSelectedId((current) => current ?? data.versions?.[0]?.id ?? null);
  }, [vaultId, noteId]);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reinicia la selección al abrir
    setSelectedId(null);
    void loadVersions();
  }, [open, loadVersions]);

  useEffect(() => {
    if (!open || !selectedId) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      const index = versions.findIndex((version) => version.id === selectedId);
      const previousId = index >= 0 ? versions[index + 1]?.id : undefined;
      const urls = [
        fetch(
          `/api/v1/vaults/${vaultId}/notes/${noteId}/versions?versionId=${selectedId}`,
        ),
        mode === "previous" && previousId
          ? fetch(
              `/api/v1/vaults/${vaultId}/notes/${noteId}/versions?versionId=${previousId}`,
            )
          : null,
      ] as const;
      const [selectedResponse, baseResponse] = await Promise.all(urls);
      if (cancelled) return;
      const selectedData = selectedResponse.ok
        ? ((await selectedResponse.json()) as { version?: { content: string } })
        : {};
      const baseData =
        mode === "previous"
          ? baseResponse && baseResponse.ok
            ? ((await baseResponse.json()) as { version?: { content: string } })
            : {}
          : {};
      setSelected(selectedData.version?.content ?? "");
      setBase(mode === "previous" ? (baseData.version?.content ?? "") : currentContent);
      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [open, selectedId, mode, versions, vaultId, noteId, currentContent]);

  async function restore() {
    if (!selectedId) return;
    if (
      !(await confirm({
        title: "Restaurar versión",
        message:
          "Se guardará una copia de la versión actual antes de cambiarla.",
        confirmLabel: "Restaurar",
      }))
    ) {
      return;
    }
    setRestoring(true);
    const response = await fetch(`/api/v1/vaults/${vaultId}/notes/${noteId}/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ versionId: selectedId }),
    });
    setRestoring(false);
    if (!response.ok) return;
    onRestored();
    onClose();
  }

  const chunks = selectedId ? diffLines(base, selected) : [];
  const added = chunks.filter((chunk) => chunk.added).reduce((sum, chunk) => sum + (chunk.count ?? 0), 0);
  const removed = chunks.filter((chunk) => chunk.removed).reduce((sum, chunk) => sum + (chunk.count ?? 0), 0);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Historial de versiones"
      subtitle={notePath}
      full
    >
      {dialogNode}
      <div className="flex h-full min-h-0 flex-col md:flex-row">
        <div className="scrollbar max-h-56 shrink-0 overflow-y-auto border-b border-[var(--border)] md:max-h-none md:w-64 md:border-b-0 md:border-r">
          {versions.length === 0 ? (
            <p className="p-4 text-xs text-[var(--muted)]">Sin versiones todavía.</p>
          ) : (
            versions.map((version) => {
              const active = version.id === selectedId;
              return (
                <button
                  key={version.id}
                  type="button"
                  onClick={() => setSelectedId(version.id)}
                  className={`flex w-full flex-col gap-0.5 border-b border-[var(--border-soft)] px-3 py-2 text-left text-[11px] transition-colors ${
                    active
                      ? "bg-[var(--accent-soft)] text-[var(--text)]"
                      : "text-[var(--text-soft)] hover:bg-[var(--panel-2)]"
                  }`}
                >
                  <span>{new Date(version.createdAt).toLocaleString("es-ES")}</span>
                  <span className="text-[9px] uppercase tracking-wide text-[var(--muted)]">
                    {SOURCE_LABELS[version.source] ?? version.source}
                  </span>
                </button>
              );
            })
          )}
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-3 py-2 text-[11px]">
            <button
              type="button"
              onClick={() => setMode("current")}
              className={`btn h-7 px-2 text-[10px] ${mode === "current" ? "bg-[var(--accent-soft)]" : "btn-ghost"}`}
            >
              Contra la actual
            </button>
            <button
              type="button"
              onClick={() => setMode("previous")}
              className={`btn h-7 px-2 text-[10px] ${mode === "previous" ? "bg-[var(--accent-soft)]" : "btn-ghost"}`}
            >
              Contra la anterior
            </button>
            <span className="ml-auto flex items-center gap-2 text-[10px]">
              <span className="text-[var(--green)]">+{added}</span>
              <span className="text-[var(--accent-2)]">−{removed}</span>
            </span>
            <button
              type="button"
              className="btn h-7 gap-1 px-2 text-[10px]"
              disabled={!selectedId || restoring}
              onClick={() => void restore()}
            >
              {restoring ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
              Restaurar
            </button>
          </div>

          <div className="scrollbar min-h-0 flex-1 overflow-auto bg-[var(--bg)] p-2 font-mono text-[11px] leading-5">
            {loading ? (
              <div className="flex items-center gap-2 p-4 text-[var(--muted)]">
                <Loader2 size={13} className="animate-spin" /> Cargando versión…
              </div>
            ) : versions.length === 0 ? (
              <p className="p-4 font-sans text-xs text-[var(--muted)]">
                Todavía no hay versiones guardadas de esta nota.
              </p>
            ) : (
              chunks.map((chunk, chunkIndex) => {
                const lines = chunk.value.split("\n");
                if (lines[lines.length - 1] === "") lines.pop();
                return lines.map((line, lineIndex) => (
                  <div
                    key={`${chunkIndex}-${lineIndex}`}
                    className={`whitespace-pre-wrap break-words px-2 ${
                      chunk.added
                        ? "bg-[color-mix(in_srgb,var(--green)_14%,transparent)] text-[var(--green)]"
                        : chunk.removed
                          ? "bg-[color-mix(in_srgb,var(--accent-2)_14%,transparent)] text-[var(--accent-2)]"
                          : "text-[var(--text-soft)]"
                    }`}
                  >
                    <span className="mr-2 inline-block w-3 select-none opacity-50">
                      {chunk.added ? "+" : chunk.removed ? "−" : " "}
                    </span>
                    {line || " "}
                  </div>
                ));
              })
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
