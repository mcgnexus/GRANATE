"use client";

import { useState } from "react";
import { GitMerge, Scissors } from "lucide-react";
import { Modal } from "@/components/ui/modal";

export function NoteComposer({
  open,
  onClose,
  vaultId,
  activePath,
  activeContent,
  notes,
  onMerged,
  onSplit,
}: {
  open: boolean;
  onClose: () => void;
  vaultId: string;
  activePath: string;
  activeContent: string;
  notes: Array<{ id: string; path: string; title?: string }>;
  onMerged: () => void;
  onSplit: (newPath: string, tail: string, kept: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<"merge" | "split">("merge");
  const [source, setSource] = useState("");
  const [heading, setHeading] = useState("");
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const candidates = notes.filter((note) => note.path !== activePath);

  async function merge() {
    if (!source) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/v1/vaults/${vaultId}/notes?path=${encodeURIComponent(source)}`);
      if (!response.ok) throw new Error("No se pudo leer la nota origen");
      const data = (await response.json()) as { note?: { content?: string } };
      const sourceContent = data.note?.content ?? "";
      const merged = `${activeContent.trimEnd()}\n\n---\n\n${sourceContent.trim()}\n`;
      const patch = await fetch(`/api/v1/vaults/${vaultId}/notes/${encodeURIComponent(activePath)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: merged }),
      });
      if (!patch.ok) throw new Error("No se pudo guardar la nota fusionada");
      const srcNote = notes.find((n) => n.path === source);
      if (srcNote) {
        await fetch(`/api/v1/vaults/${vaultId}/notes/${srcNote.id}`, { method: "DELETE" });
      }
      onMerged();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function split() {
    if (!heading.trim() || !target.trim()) return;
    const lines = activeContent.split("\n");
    const idx = lines.findIndex((line) => new RegExp(`^#{1,6}\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i").test(line));
    if (idx === -1) { setError("Encabezado no encontrado"); return; }
    const kept = lines.slice(0, idx).join("\n").trimEnd();
    const tail = lines.slice(idx).join("\n").trim();
    setBusy(true);
    setError("");
    try {
      await onSplit(target.trim(), tail, kept);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Componer notas" subtitle="Fusionar o dividir">
      <div className="p-4">
        <div className="mb-3 flex gap-1">
          <button type="button" onClick={() => setMode("merge")} className={`btn h-7 px-2 text-[10px] ${mode === "merge" ? "bg-[var(--accent-soft)]" : "btn-ghost"}`}>
            <GitMerge size={12} /> Fusionar
          </button>
          <button type="button" onClick={() => setMode("split")} className={`btn h-7 px-2 text-[10px] ${mode === "split" ? "bg-[var(--accent-soft)]" : "btn-ghost"}`}>
            <Scissors size={12} /> Dividir
          </button>
        </div>
        {mode === "merge" ? (
          <div className="space-y-3">
            <label className="block text-[11px] text-[var(--muted)]">
              Nota a fusionar en la actual
              <select value={source} onChange={(e) => setSource(e.target.value)} className="input mt-1">
                <option value="">Selecciona...</option>
                {candidates.map((note) => (
                  <option key={note.id} value={note.path}>{note.path}</option>
                ))}
              </select>
            </label>
            <button type="button" disabled={!source || busy} onClick={() => void merge()} className="btn h-8 w-full justify-center">
              {busy ? "Fusionando..." : "Fusionar"}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <label className="block text-[11px] text-[var(--muted)]">
              Encabezado por el que dividir
              <input value={heading} onChange={(e) => setHeading(e.target.value)} className="input mt-1" placeholder="Título del encabezado" />
            </label>
            <label className="block text-[11px] text-[var(--muted)]">
              Ruta de la nueva nota
              <input value={target} onChange={(e) => setTarget(e.target.value)} className="input mt-1" placeholder="Nueva nota.md" />
            </label>
            <button type="button" disabled={!heading.trim() || !target.trim() || busy} onClick={() => void split()} className="btn h-8 w-full justify-center">
              {busy ? "Dividiendo..." : "Dividir"}
            </button>
          </div>
        )}
        {error ? <p className="mt-3 text-[11px] text-red-400">{error}</p> : null}
      </div>
    </Modal>
  );
}
