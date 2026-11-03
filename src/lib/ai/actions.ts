import { completeChat, type ChatMessage } from "./llm";

export type NoteAction =
  | "review"
  | "summarize"
  | "structure"
  | "tags"
  | "moc"
  | "related";

const PROMPTS: Record<NoteAction, string> = {
  review:
    "Revisa la nota y devuelve una versión corregida y mejorada en Markdown. " +
    "Corrige ortografía y gramática, mejora claridad, conserva el significado, los enlaces [[...]] y las etiquetas. " +
    "Mantén el frontmatter YAML si existe. Devuelve SOLO el Markdown final, sin explicaciones ni bloques de código envolventes.",
  summarize:
    "Resume la nota en español en 5-8 líneas. Destaca ideas clave, decisiones y próximos pasos. " +
    "Devuelve solo el resumen, sin Markdown decorativo innecesario.",
  structure:
    "Reorganiza la nota para que sea fácil de leer: propón una estructura de encabezados clara, agrupa ideas y elimina duplicados. " +
    "Devuelve SOLO el Markdown final, sin explicaciones. Conserva enlaces y etiquetas.",
  tags:
    "Propón etiquetas para esta nota. Devuelve únicamente un array JSON de strings sin el símbolo #, " +
    "de 3 a 8 etiquetas, en minúsculas, reutilizando las existentes cuando encaje. Sin texto adicional.",
  moc:
    "Crea una nota índice (MOC, Map of Content) en Markdown que organice las notas relacionadas. " +
    "Incluye enlaces [[...]] a las notas del contexto, agrupados por tema, con una frase descriptiva por enlace. " +
    "Devuelve solo el Markdown.",
  related:
    "Sugiere 5 notas relacionadas del contexto y explica en una línea por qué se relacionan. " +
    "Devuelve una lista Markdown con enlaces [[ruta|título]] y la justificación.",
};

export const ACTION_LABELS: Record<NoteAction, string> = {
  review: "Revisar redacción",
  summarize: "Resumir",
  structure: "Reorganizar",
  tags: "Sugerir etiquetas",
  moc: "Crear índice (MOC)",
  related: "Notas relacionadas",
};

export function isNoteAction(value: string): value is NoteAction {
  return Object.prototype.hasOwnProperty.call(PROMPTS, value);
}

export function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const match = /^```(?:markdown|md)?\n([\s\S]*?)\n```$/i.exec(trimmed);
  return match ? match[1] : trimmed;
}

export async function runNoteAction(
  action: NoteAction,
  note: { title: string; path: string; content: string },
  context = "",
): Promise<string> {
  const messages: ChatMessage[] = [
    { role: "system", content: PROMPTS[action] },
    {
      role: "user",
      content:
        `Nota: ${note.title} (${note.path})\n\n${note.content}` +
        (context ? `\n\nContexto adicional de la bóveda:\n${context}` : ""),
    },
  ];

  const result = await completeChat(messages, {
    maxTokens: action === "review" || action === "structure" ? 4000 : 1200,
    temperature: action === "tags" ? 0.2 : 0.35,
  });

  return stripCodeFence(result);
}
