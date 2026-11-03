"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return document.documentElement.dataset.theme === "light";
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const light = useSyncExternalStore(subscribe, getSnapshot, () => false);

  function toggle() {
    const next = !light;
    if (next) document.documentElement.dataset.theme = "light";
    else delete document.documentElement.dataset.theme;
    try {
      localStorage.setItem("granate-theme", next ? "light" : "dark");
    } catch {
      // ignore
    }
    for (const listener of listeners) listener();
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={`btn btn-ghost h-9 w-9 p-0 ${className}`}
      aria-label={light ? "Cambiar a tema oscuro" : "Cambiar a tema claro"}
      title={light ? "Tema oscuro" : "Tema claro"}
    >
      {light ? <Moon size={16} /> : <Sun size={16} />}
    </button>
  );
}
