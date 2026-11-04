/**
 * Transformaciones de Markdown sobre bloques de texto (una o varias líneas).
 * Funciones puras sin DOM para poder testearlas y reutilizarlas desde el editor.
 */

/** Operaciones de encabezados (buscar, renombrar, marcar y extraer secciones). */

const HEADING_RE = /^(#{1,6})\s+(.*)$/;

export type HeadingSection = {
  level: number;
  title: string;
  /** Índice de la línea del encabezado dentro del documento. */
  lineIndex: number;
  /** Offset del inicio de la línea del encabezado. */
  lineStart: number;
  /** Offset del final de la línea del encabezado (sin el salto de línea). */
  lineEnd: number;
  /** Igual que `lineStart`: la sección incluye su encabezado. */
  sectionStart: number;
  /**
   * Inicio del siguiente encabezado de nivel igual o superior, o el final del
   * documento si no hay ninguno. El corte es exclusivo.
   */
  sectionEnd: number;
};

export type TextChange = { from: number; to: number; insert: string };

function lineStarts(doc: string): number[] {
  const starts = [0];
  for (let i = 0; i < doc.length; i++) {
    if (doc[i] === "\n") starts.push(i + 1);
  }
  return starts;
}

function cleanHeadingTitle(raw: string): string {
  return raw
    .replace(/\s+#+$/, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim();
}

/**
 * Localiza el encabezado de la línea que contiene `offset` (o el más cercano
 * hacia arriba) y el rango de su sección. Devuelve `null` si no hay ninguno.
 */
export function findHeadingSection(doc: string, offset: number): HeadingSection | null {
  const lines = doc.split("\n");
  const starts = lineStarts(doc);
  const pos = Math.max(0, Math.min(offset, doc.length));
  let index = starts.length - 1;
  while (index > 0 && starts[index] > pos) index--;

  let heading = -1;
  let level = 0;
  let title = "";
  for (let i = index; i >= 0; i--) {
    const match = HEADING_RE.exec(lines[i]);
    if (match) {
      heading = i;
      level = match[1].length;
      title = cleanHeadingTitle(match[2]);
      break;
    }
  }
  if (heading < 0) return null;

  const lineStart = starts[heading];
  const lineEnd = lineStart + lines[heading].length;
  let sectionEnd = doc.length;
  for (let i = heading + 1; i < lines.length; i++) {
    const match = HEADING_RE.exec(lines[i]);
    if (match && match[1].length <= level) {
      sectionEnd = starts[i];
      break;
    }
  }
  return { level, title, lineIndex: heading, lineStart, lineEnd, sectionStart: lineStart, sectionEnd };
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Cambio para renombrar el encabezado bajo `offset` conservando su nivel.
 * Devuelve `null` si no hay encabezado o el nombre está vacío.
 */
export function renameHeadingRange(
  doc: string,
  offset: number,
  newTitle: string,
): TextChange | null {
  const found = findHeadingSection(doc, offset);
  const title = newTitle.trim();
  if (!found || !title) return null;
  return {
    from: found.lineStart,
    to: found.lineEnd,
    insert: `${"#".repeat(found.level)} ${title}`,
  };
}

/**
 * Cambio para añadir o quitar una etiqueta (por defecto `#marcado`) al final
 * de la línea del encabezado bajo `offset`. Es un toggle.
 */
export function toggleHeadingTagRange(
  doc: string,
  offset: number,
  tag = "#marcado",
): TextChange | null {
  const found = findHeadingSection(doc, offset);
  if (!found) return null;
  const line = doc.slice(found.lineStart, found.lineEnd);
  const token = new RegExp(`(^|\\s)${escapeRegExp(tag)}(?=\\s|$)`);
  const insert = token.test(line)
    ? line
        .replace(token, "$1")
        .replace(/[ \t]{2,}/g, " ")
        .replace(/[ \t]+$/, "")
    : `${line.replace(/[ \t]+$/, "")} ${tag}`;
  return { from: found.lineStart, to: found.lineEnd, insert };
}

/** Elimina el rango `[from, to)` uniendo el resto con una línea en blanco. */
export function removeSection(doc: string, from: number, to: number): string {
  const start = Math.max(0, Math.min(from, doc.length));
  const end = Math.max(start, Math.min(to, doc.length));
  const head = doc.slice(0, start).replace(/\s+$/, "");
  const tail = doc.slice(end).replace(/^\s+/, "");
  if (!head) return tail;
  if (!tail) return `${head}\n`;
  return `${head}\n\n${tail}`;
}

/**
 * Nombre de fichero sugerido a partir del título de un encabezado: sin formato
 * Markdown, sin caracteres ilegales en rutas (`#` rompería los wikilinks) y sin
 * puntos o espacios al final (Windows). Nunca devuelve cadena vacía.
 */
export function suggestNoteName(title: string): string {
  const cleaned = stripFormatting(title)
    .replace(/[#\\/:"*?<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "");
  return cleaned || "Sección";
}

type ListKind = "bullet" | "number" | "task";

const LIST_MARKER =
  /^(\s*)(?:([-*+])\s+\[( |x|X)\]\s+|([-*+])\s+|(\d+)([.)])\s+)/;

function removeListMarker(line: string): string {
  return line.replace(LIST_MARKER, "$1");
}

function hasListMarker(line: string, kind: ListKind): boolean {
  if (!line.trim()) return true; // las líneas vacías no cuentan
  if (kind === "number") return /^\s*\d+[.)]\s+/.test(line);
  if (kind === "task") return /^\s*[-*+]\s+\[( |x|X)\]\s+/.test(line);
  return /^\s*[-*+]\s+(?!\[( |x|X)\])/.test(line);
}

/**
 * Aplica o quita un tipo de lista en el texto dado. Si todas las líneas con
 * contenido ya llevan ese tipo de lista, las limpia (toggle); si no, convierte
 * cualquier marcador de lista existente al tipo pedido.
 */
export function toggleListLines(text: string, kind: ListKind): string {
  const lines = text.split("\n");
  const allMarked = lines.filter((line) => line.trim()).every((line) => hasListMarker(line, kind));

  let index = 0;
  return lines
    .map((line) => {
      if (!line.trim()) return line;
      const body = removeListMarker(line);
      const indent = body.match(/^\s*/)?.[0] ?? "";
      if (allMarked) return body;
      index += 1;
      const marker =
        kind === "bullet" ? "- " : kind === "task" ? "- [ ] " : `${index}. `;
      return `${indent}${marker}${body.slice(indent.length)}`;
    })
    .join("\n");
}

/** Aplica o quita cita (`> `) en el texto dado. */
export function toggleQuoteLines(text: string): string {
  const lines = text.split("\n");
  const contentLines = lines.filter((line) => line.trim());
  const allQuoted = contentLines.length > 0 && contentLines.every((line) => /^\s*>\s?/.test(line));

  return lines
    .map((line) => {
      if (!line.trim()) return line;
      return allQuoted ? line.replace(/^(\s*)>\s?/, "$1") : `> ${line}`;
    })
    .join("\n");
}

/**
 * Limpia el formato Markdown/HTML de un fragmento: cabeceras, listas, citas,
 * negritas, cursivas, código, resaltados, comentarios, matemáticas, enlaces,
 * wikilinks y etiquetas de color/subrayado. El contenido de las wikilinks con
 * alias conserva el alias.
 */
export function stripFormatting(text: string): string {
  return text
    .replace(/^(\s*)#{1,6}\s+/gm, "$1")
    .replace(/^(\s*)>\s?/gm, "$1")
    .replace(/^(\s*)(?:[-*+]\s+\[( |x|X)\]\s+|[-*+]\s+|\d+[.)]\s+)/gm, "$1")
    .replace(/\*\*\*([\s\S]+?)\*\*\*/g, "$1")
    .replace(/\*\*([\s\S]+?)\*\*/g, "$1")
    .replace(/\*([\s\S]+?)\*/g, "$1")
    .replace(/___([\s\S]+?)___/g, "$1")
    .replace(/__([\s\S]+?)__/g, "$1")
    .replace(/(^|[\s(])_([^_\n]+?)_(?=$|[\s).,;:!?])/g, "$1$2")
    .replace(/~~([\s\S]+?)~~/g, "$1")
    .replace(/==([\s\S]+?)==/g, "$1")
    .replace(/%%([\s\S]+?)%%/g, "$1")
    .replace(/`([^`\n]*)`/g, "$1")
    .replace(/\$\$([\s\S]+?)\$\$/g, "$1")
    .replace(/\$([^$\n]+?)\$/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<\/?(?:mark|span|u|b|strong|em|i)(?:\s[^>]*)?>/g, "");
}
