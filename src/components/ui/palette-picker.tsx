"use client";

import { useSyncExternalStore } from "react";
import { Check } from "lucide-react";
import { DEFAULT_PALETTE, PALETTES, isPaletteId } from "@/lib/palettes";

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): string {
  const value = document.documentElement.dataset.palette ?? DEFAULT_PALETTE;
  return isPaletteId(value) ? value : DEFAULT_PALETTE;
}

function setPalette(id: string) {
  document.documentElement.dataset.palette = id;
  try {
    localStorage.setItem("granate-palette", id);
  } catch {
    // ignore
  }
  for (const listener of listeners) listener();
}

export function PalettePicker() {
  const current = useSyncExternalStore(subscribe, getSnapshot, () => DEFAULT_PALETTE);

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {PALETTES.map((palette) => {
        const active = palette.id === current;
        return (
          <button
            key={palette.id}
            type="button"
            onClick={() => setPalette(palette.id)}
            aria-pressed={active}
            className={`group relative flex items-center gap-2.5 rounded-lg border p-2.5 text-left transition-colors ${
              active
                ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                : "border-[var(--border)] bg-[var(--panel-2)] hover:border-[var(--muted)]"
            }`}
          >
            <span
              className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full border"
              style={{
                background: palette.swatch.surface,
                borderColor: palette.swatch.accent,
              }}
            >
              <span
                className="absolute bottom-1 right-1 h-2.5 w-2.5 rounded-full"
                style={{ background: palette.swatch.accent }}
              />
              <span
                className="absolute left-1 top-1 h-1.5 w-1.5 rounded-full"
                style={{ background: palette.swatch.detail }}
              />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[11px] font-medium">{palette.name}</span>
              <span className="block truncate text-[9px] leading-3 text-[var(--muted)]">
                {palette.description}
              </span>
            </span>
            {active ? (
              <Check
                size={12}
                className="absolute right-1.5 top-1.5 text-[var(--accent-2)]"
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
