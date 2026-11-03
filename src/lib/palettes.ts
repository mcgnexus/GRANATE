export type Palette = {
  id: string;
  name: string;
  description: string;
  /** Colores usados solo para la muestra visual. */
  swatch: { surface: string; accent: string; detail: string };
};

export const PALETTES: Palette[] = [
  {
    id: "granate",
    name: "Granate",
    description: "Burdeos, papel cálido y oro",
    swatch: { surface: "#1b1615", accent: "#b23a48", detail: "#c9a227" },
  },
  {
    id: "onice",
    name: "Ónice",
    description: "Grafito neutro con azul eléctrico",
    swatch: { surface: "#151518", accent: "#5b6cff", detail: "#d4b45a" },
  },
  {
    id: "bosque",
    name: "Bosque",
    description: "Verde profundo y musgo",
    swatch: { surface: "#121c17", accent: "#3f8f5f", detail: "#c9a227" },
  },
  {
    id: "oceano",
    name: "Océano",
    description: "Azul marino y cian",
    swatch: { surface: "#121f33", accent: "#2f7fd8", detail: "#d9a441" },
  },
  {
    id: "ambar",
    name: "Ámbar",
    description: "Café cálido y ámbar",
    swatch: { surface: "#1d1710", accent: "#b8791f", detail: "#e0b34a" },
  },
  {
    id: "lavanda",
    name: "Lavanda",
    description: "Ciruela y violeta suave",
    swatch: { surface: "#171320", accent: "#7c5cbf", detail: "#d4b45a" },
  },
];

export const DEFAULT_PALETTE = "granate";

export function isPaletteId(value: string): boolean {
  return PALETTES.some((palette) => palette.id === value);
}
