"use client";

import { useEffect } from "react";
import { DEFAULT_PALETTE, isPaletteId } from "@/lib/palettes";

/** Applies the user's server-side palette/theme once per session. */
export function PreferencesSync() {
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/v1/preferences")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { preferences?: { palette?: string; theme?: string } } | null) => {
        if (cancelled || !data?.preferences) return;
        const { palette, theme } = data.preferences;
        if (palette && isPaletteId(palette)) {
          document.documentElement.dataset.palette = palette;
          try {
            localStorage.setItem("granate-palette", palette);
          } catch {
            // ignore
          }
        } else {
          document.documentElement.dataset.palette ??= DEFAULT_PALETTE;
        }
        if (theme === "light") {
          document.documentElement.dataset.theme = "light";
          try {
            localStorage.setItem("granate-theme", "light");
          } catch {
            // ignore
          }
        } else if (theme === "dark") {
          delete document.documentElement.dataset.theme;
          try {
            localStorage.setItem("granate-theme", "dark");
          } catch {
            // ignore
          }
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
