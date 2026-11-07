import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function countWords(text: string): number {
  const plain = text
    .replace(/^---[\s\S]*?---/, "")
    .replace(/`[^`]*`/g, " ")
    .replace(/[#>*_~[\]()|-]/g, " ");
  return plain.split(/\s+/).filter(Boolean).length;
}

export function titleFromPath(path: string): string {
  const base = path.split("/").pop() ?? path;
  return base.replace(/\.md$/, "");
}

export function parentPath(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? "" : path.slice(0, idx);
}

export function normalizeVaultPath(input: string): string {
  return input
    .replace(/\\/g, "/")
    .replace(/^\.?\//, "")
    .replace(/\/+/g, "/")
    .replace(/^\/|\/$/g, "")
    .trim();
}

const ROLE_LABELS: Record<string, string> = {
  owner: "propietario",
  editor: "editor",
  viewer: "lector",
};

export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}
