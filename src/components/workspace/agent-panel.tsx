"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Check,
  FilePlus2,
  FolderInput,
  FolderPlus,
  Loader2,
  Pencil,
  Play,
  RotateCcw,
  Sparkles,
  Tag,
  Trash2,
  X,
} from "lucide-react";

type Operation = {
  op: string;
  path?: string;
  from?: string;
  to?: string;
  tag?: string;
  summary: string;
  destructive: boolean;
  warning?: string;
};

type Plan = {
  summary: string;
  operations: Operation[];
  model: string;
};

type ExecutionResult = {
  results: Array<{ op: string; summary: string; ok: boolean; error?: string }>;
  updated: number;
  failed: number;
};

const OP_ICONS: Record<string, React.ReactNode> = {
  createNote: <FilePlus2 size={13} />,
  createFolder: <FolderPlus size={13} />,
  moveNote: <FolderInput size={13} />,
  renameNote: <Pencil size={13} />,
  moveFolder: <FolderInput size={13} />,
  renameFolder: <Pencil size={13} />,
  deleteNote: <Trash2 size={13} />,
  deleteFolder: <Trash2 size={13} />,
  tagNote: <Tag size={13} />,
};

export function AgentPanel({
  vaultId,
  onChanged,
  onToast,
}: {
  vaultId: string;
  onChanged: () => void;
  onToast: (message: string) => void;
}) {
  const [instruction, setInstruction] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [confirmDestructive, setConfirmDestructive] = useState(false);
  const [error, setError] = useState("");

  const destructive = plan?.operations.filter((operation) => operation.destructive) ?? [];
  const warnings = plan?.operations.filter((operation) => operation.warning) ?? [];

  async function propose() {
    if (!instruction.trim() || loading) return;
    setLoading(true);
    setError("");
    setPlan(null);
    setResult(null);
    setConfirmDestructive(false);
    try {
      const response = await fetch(`/api/v1/vaults/${vaultId}/agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "plan", instruction: instruction.trim() }),
      });
      const data = (await response.json().catch(() => ({}))) as Plan & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "No se pudo generar el plan");
      setPlan({ summary: data.summary ?? "", operations: data.operations ?? [], model: data.model });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  async function execute() {
    if (!plan || !plan.operations.length || executing) return;
    if (destructive.length && !confirmDestructive) return;
    setExecuting(true);
    setError("");
    try {
      const response = await fetch(`/api/v1/vaults/${vaultId}/agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "execute",
          operations: plan.operations,
          allowDestructive: destructive.length > 0,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as ExecutionResult & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "No se pudo ejecutar el plan");
      setResult(data);
      onChanged();
      onToast(
        data.failed
          ? `${data.updated} operaciones aplicadas, ${data.failed} con error`
          : `${data.updated} operaciones aplicadas`,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Error desconocido");
    } finally {
      setExecuting(false);
    }
  }

  function reset() {
    setPlan(null);
    setResult(null);
    setConfirmDestructive(false);
    setError("");
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3">
        <Sparkles size={15} className="text-[var(--gold)]" />
        <div className="min-w-0">
          <div className="text-sm font-medium">Agente de la bóveda</div>
          <div className="truncate text-[10px] text-[var(--muted)]">
            Propone y ejecuta cambios con confirmación
          </div>
        </div>
      </div>

      <div className="scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-3 text-[11px] leading-5 text-[var(--muted)]">
          Ejemplos:
          <ul className="mt-1.5 space-y-1">
            <li>«Crea una carpeta Proyectos y mueve ahí las notas de TecRural»</li>
            <li>«Crea una nota Índice en Proyectos con un resumen de sus notas»</li>
            <li>«Mueve a la papelera las notas duplicadas»</li>
          </ul>
          <p className="mt-2 text-[10px]">
            El plan es solo una propuesta. No se ejecuta nada hasta que pulses «Ejecutar plan».
          </p>
        </div>

        <textarea
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void propose();
            }
          }}
          rows={3}
          placeholder="¿Qué quieres hacer en la bóveda?"
          className="input resize-none text-xs"
          disabled={loading || executing}
        />

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-primary h-9 gap-1.5 text-xs"
            disabled={loading || executing || !instruction.trim()}
            onClick={() => void propose()}
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            Proponer plan
          </button>
          {plan ? (
            <button type="button" className="btn h-9 gap-1 text-xs" onClick={reset}>
              <RotateCcw size={13} /> Descartar
            </button>
          ) : null}
        </div>

        {error ? (
          <div className="rounded-lg border border-[var(--accent)]/40 bg-[var(--accent-soft)] px-3 py-2 text-[11px] text-[var(--accent-2)]">
            {error}
          </div>
        ) : null}

        {plan ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] uppercase tracking-wide text-[var(--muted)]">
                  Plan propuesto
                </span>
                <span className="max-w-[55%] truncate text-[9px] text-[var(--muted)]" title={plan.model}>
                  {plan.model}
                </span>
              </div>
              {plan.summary ? (
                <p className="mt-1.5 text-[11.5px] leading-5 text-[var(--text-soft)]">
                  {plan.summary}
                </p>
              ) : null}
              <div className="mt-2 space-y-1">
                {plan.operations.map((operation, index) => (
                  <div
                    key={`${operation.op}-${index}`}
                    className="flex items-start gap-2 rounded-md border border-[var(--border-soft)] px-2 py-1.5 text-[11px]"
                  >
                    <span
                      className={`mt-0.5 shrink-0 ${
                        operation.destructive ? "text-[var(--accent-2)]" : "text-[var(--muted)]"
                      }`}
                    >
                      {OP_ICONS[operation.op] ?? <Sparkles size={13} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[var(--text-soft)]">{operation.summary}</div>
                      {operation.warning ? (
                        <div className="mt-0.5 flex items-center gap-1 text-[9.5px] text-[var(--accent-2)]">
                          <AlertTriangle size={9} /> {operation.warning}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
                {plan.operations.length === 0 ? (
                  <p className="text-[11px] text-[var(--muted)]">
                    El modelo no propuso ninguna operación.
                  </p>
                ) : null}
              </div>
              {warnings.length ? (
                <p className="mt-2 text-[9.5px] text-[var(--muted)]">
                  {warnings.length} operación(es) con avisos. Se aplicarán igualmente si son válidas.
                </p>
              ) : null}
            </div>

            {destructive.length ? (
              <label className="flex items-start gap-2 rounded-lg border border-[var(--accent)]/40 bg-[var(--accent-soft)] p-3 text-[11px] leading-5">
                <input
                  type="checkbox"
                  checked={confirmDestructive}
                  onChange={(event) => setConfirmDestructive(event.target.checked)}
                  className="mt-1"
                />
                <span>
                  Confirmo que quiero ejecutar {destructive.length} operación(es) destructiva(s):
                  las notas se moverán a la papelera y las carpetas vacías se eliminarán.
                </span>
              </label>
            ) : null}

            <button
              type="button"
              className="btn btn-primary h-9 w-full justify-center gap-1.5 text-xs"
              disabled={
                executing || !plan.operations.length || (destructive.length > 0 && !confirmDestructive)
              }
              onClick={() => void execute()}
            >
              {executing ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
              Ejecutar plan
            </button>
          </div>
        ) : null}

        {result ? (
          <div className="space-y-2">
            <div className="text-[10px] uppercase tracking-wide text-[var(--muted)]">
              Resultado · {result.updated} aplicadas, {result.failed} con error
            </div>
            <div className="space-y-1">
              {result.results.map((item, index) => (
                <div
                  key={`${item.op}-${index}`}
                  className={`flex items-start gap-2 rounded-md border px-2 py-1.5 text-[11px] ${
                    item.ok
                      ? "border-[var(--border-soft)] text-[var(--text-soft)]"
                      : "border-[var(--accent)]/40 text-[var(--accent-2)]"
                  }`}
                >
                  {item.ok ? (
                    <Check size={12} className="mt-0.5 shrink-0 text-[var(--green)]" />
                  ) : (
                    <X size={12} className="mt-0.5 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div>{item.summary}</div>
                    {item.error ? <div className="text-[9.5px]">{item.error}</div> : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
