/**
 * Conversión de comentarios estilo Obsidian (`%%texto%%`) a comentarios HTML.
 * El preview los elimina al sanitizar, así que no se renderizan; en el editor
 * siguen visibles como texto.
 *
 * Al igual que el preprocesador de wikilinks del preview, no mira dentro de
 * bloques de código: es un compromiso aceptado en esta app.
 */
export function hideComments(content: string): string {
  return content.replace(/%%([\s\S]+?)%%/g, (_full, inner: string) => {
    const safe = inner.replace(/--+/g, "·");
    return `<!-- ${safe} -->`;
  });
}
