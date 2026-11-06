"use client";

import { useEffect, useState } from "react";

/**
 * Detecta puntero grueso (táctil) con `matchMedia("(pointer: coarse)")`.
 * Se evalúa solo en cliente; en SSR devuelve `false` (variante desktop).
 */
export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const query = window.matchMedia("(pointer: coarse)");
    const update = () => setCoarse(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return coarse;
}
