"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";

type RowType = "text" | "number" | "boolean" | "date" | "list";

type Row = {
  key: string;
  type: RowType;
  value: string;
};

function inferType(value: unknown): RowType {
  if (Array.isArray(value)) return "list";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return "date";
  return "text";
}

function toRow(key: string, value: unknown): Row {
  if (Array.isArray(value)) {
    return { key, type: "list", value: value.map(String).join(", ") };
  }
  if (typeof value === "boolean") {
    return { key, type: "boolean", value: value ? "true" : "false" };
  }
  return { key, type: inferType(value), value: value === null || value === undefined ? "" : String(value) };
}

function fromRow(row: Row): unknown {
  if (row.type === "number") {
    const number = Number(row.value);
    return Number.isFinite(number) ? number : 0;
  }
  if (row.type === "boolean") return row.value === "true";
  if (row.type === "list") {
    return row.value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return row.value;
}

export function PropertiesEditor({
  open,
  onClose,
  frontmatter,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  frontmatter: Record<string, unknown>;
  onSave: (next: Record<string, unknown>) => Promise<void> | void;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open && !wasOpen.current) {
      setRows(Object.entries(frontmatter).map(([key, value]) => toRow(key, value)));
    }
    wasOpen.current = open;
  }, [open, frontmatter]);

  function update(index: number, patch: Partial<Row>) {
    setRows((current) =>
      current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
    );
  }

  async function save() {
    const next: Record<string, unknown> = {};
    for (const row of rows) {
      const key = row.key.trim();
      if (!key) continue;
      next[key] = fromRow(row);
    }
    setSaving(true);
    await onSave(next);
    setSaving(false);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Propiedades de la nota"
      subtitle="Edita el frontmatter sin tocar el YAML"
      wide
    >
      <div className="space-y-3 p-4">
        <div className="hidden grid-cols-[1.2fr_0.8fr_1.6fr_auto] gap-2 px-1 text-[10px] uppercase tracking-wide text-[var(--muted)] sm:grid">
          <span>Clave</span>
          <span>Tipo</span>
          <span>Valor</span>
          <span />
        </div>

        {rows.map((row, index) => (
          <div
            key={`${index}-${row.key}`}
            className="grid grid-cols-1 gap-2 rounded-lg border border-[var(--border-soft)] p-2 sm:grid-cols-[1.2fr_0.8fr_1.6fr_auto] sm:border-0 sm:p-0"
          >
            <input
              className="input h-8 text-xs"
              value={row.key}
              placeholder="clave"
              onChange={(event) => update(index, { key: event.target.value })}
            />
            <select
              className="input h-8 text-xs"
              value={row.type}
              onChange={(event) => update(index, { type: event.target.value as RowType })}
            >
              <option value="text">Texto</option>
              <option value="number">Número</option>
              <option value="boolean">Booleano</option>
              <option value="date">Fecha</option>
              <option value="list">Lista</option>
            </select>
            {row.type === "boolean" ? (
              <select
                className="input h-8 text-xs"
                value={row.value}
                onChange={(event) => update(index, { value: event.target.value })}
              >
                <option value="true">Sí</option>
                <option value="false">No</option>
              </select>
            ) : row.type === "date" ? (
              <input
                type="date"
                className="input h-8 text-xs"
                value={row.value.slice(0, 10)}
                onChange={(event) => update(index, { value: event.target.value })}
              />
            ) : (
              <input
                className="input h-8 text-xs"
                value={row.value}
                placeholder={row.type === "list" ? "valor1, valor2" : "valor"}
                onChange={(event) => update(index, { value: event.target.value })}
              />
            )}
            <button
              type="button"
              className="btn btn-ghost h-8 w-8 p-0 text-[var(--accent-2)]"
              onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
              title="Quitar propiedad"
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}

        <button
          type="button"
          className="btn h-8 gap-1 text-[11px]"
          onClick={() => setRows((current) => [...current, { key: "", type: "text", value: "" }])}
        >
          <Plus size={13} /> Añadir propiedad
        </button>

        <div className="flex justify-end gap-2 border-t border-[var(--border)] pt-3">
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void save()}>
            Guardar propiedades
          </button>
        </div>
      </div>
    </Modal>
  );
}
