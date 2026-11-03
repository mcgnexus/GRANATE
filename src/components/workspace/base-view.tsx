"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Loader2, SquareKanban } from "lucide-react";
import { columnLabel } from "@/lib/bases";

type BaseRow = {
  id: string;
  path: string;
  title: string;
  values: Record<string, unknown>;
};

type Result = {
  view: { name: string; type: string };
  columns: string[];
  rows: BaseRow[];
  groups: Array<{ key: string; rows: BaseRow[] }> | null;
};

type Views = Array<{ name: string; type: string }>;

function valueLabel(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function BaseView({
  vaultId,
  basePath,
  onOpenNote,
}: {
  vaultId: string;
  basePath: string;
  onOpenNote: (path: string) => void;
}) {
  const [result, setResult] = useState<Result | null>(null);
  const [views, setViews] = useState<Views>([]);
  const [view, setView] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const query = new URLSearchParams({ path: basePath });
        if (view) query.set("view", view);
        const response = await fetch(`/api/v1/vaults/${vaultId}/bases?${query}`);
        const data = (await response.json()) as {
          parsed?: { views: Views };
          result?: Result;
          error?: string;
        };
        if (!active) return;
        if (!response.ok) throw new Error(data.error ?? "Base no encontrada");
        setResult(data.result ?? null);
        setViews(data.parsed?.views ?? []);
        if (!view && data.result?.view.name) setView(data.result.view.name);
        setLoading(false);
      } catch (caught) {
        if (active) {
          setError(caught instanceof Error ? caught.message : "Error");
          setLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [vaultId, basePath, view]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-[var(--muted)]">
        <Loader2 size={16} className="animate-spin" /> Evaluando base…
      </div>
    );
  }

  if (error) {
    return <div className="p-6 text-sm text-[var(--accent-2)]">{error}</div>;
  }

  if (!result) {
    return <div className="p-6 text-sm text-[var(--muted)]">Esta base no tiene vistas.</div>;
  }

  const renderTable = (rows: BaseRow[]) => (
    <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
      <table className="w-full border-collapse text-left text-xs">
        <thead>
          <tr className="bg-[var(--panel-2)] text-[var(--muted)]">
            {result.columns.map((column) => (
              <th key={column} className="whitespace-nowrap border-b border-[var(--border)] px-3 py-2 font-medium">
                {columnLabel(column)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-[var(--border-soft)] last:border-0 hover:bg-[var(--panel-2)]">
              {result.columns.map((column) => {
                const value = row.values[column];
                const isName = /file\.(name|path|link)|title$/.test(column);
                return (
                  <td key={column} className="max-w-[280px] truncate px-3 py-2 text-[var(--text-soft)]">
                    {isName ? (
                      <button
                        type="button"
                        className="text-[var(--accent-2)] hover:underline"
                        onClick={() => onOpenNote(row.path)}
                      >
                        {valueLabel(value) || row.title}
                      </button>
                    ) : (
                      valueLabel(value)
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={result.columns.length || 1} className="px-3 py-8 text-center text-[var(--muted)]">
                Ninguna nota cumple los filtros de esta vista.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-[var(--border)] px-4 py-2.5">
        <SquareKanban size={15} className="text-[var(--green)]" />
        <span className="text-xs text-[var(--text-soft)]">{basePath}</span>
        {views.length > 1 ? (
          <label className="relative ml-auto">
            <select
              value={view}
              onChange={(event) => setView(event.target.value)}
              className="input h-8 appearance-none py-1 pr-8 text-xs"
            >
              {views.map((item) => (
                <option key={item.name} value={item.name}>
                  {item.name} · {item.type}
                </option>
              ))}
            </select>
            <ChevronDown size={13} className="pointer-events-none absolute right-2 top-2.5 text-[var(--muted)]" />
          </label>
        ) : null}
        <span className="chip">{result.rows.length} notas</span>
      </div>
      <div className="scrollbar min-h-0 flex-1 space-y-5 overflow-auto p-4">
        {result.groups
          ? result.groups.map((group) => (
              <div key={group.key}>
                <h3 className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-[var(--muted)]">
                  {group.key} · {group.rows.length}
                </h3>
                {renderTable(group.rows)}
              </div>
            ))
          : renderTable(result.rows)}
      </div>
    </div>
  );
}
