import { describe, expect, it } from "vitest";
import {
  identitySourceMap,
  replaceSourceRange,
  transformWithSourceMap,
} from "@/lib/markdown/source-map";

describe("Markdown source maps", () => {
  it("preserves source ranges across comments and wikilink expansion", () => {
    const source = "---\ntitle: test\n---\n\n## Título\n\nTexto [[Guia|la guía]] %%oculto%%.\n";
    const frontmatterLength = source.indexOf("## Título");
    let mapped = {
      text: source.slice(frontmatterLength),
      sourceMap: identitySourceMap(source.length - frontmatterLength, frontmatterLength),
    };
    mapped = transformWithSourceMap(
      mapped.text,
      mapped.sourceMap,
      /%%([\s\S]+?)%%/g,
      (match) => `<!-- ${match[1]} -->`,
    );
    mapped = transformWithSourceMap(
      mapped.text,
      mapped.sourceMap,
      /(!)?\[\[([^\]]+?)\]\]/g,
      (match) => `[${match[2].split("|")[1]}](granate:Guia)`,
    );

    const generatedStart = mapped.text.indexOf("Texto");
    const generatedEnd = mapped.text.indexOf("\n", generatedStart);
    const originalStart = source.indexOf("Texto");
    const originalEnd = source.indexOf("\n", originalStart);
    expect(mapped.sourceMap[generatedStart]).toBe(originalStart);
    expect(mapped.sourceMap[generatedEnd]).toBe(originalEnd);
    expect(source.slice(mapped.sourceMap[generatedStart], mapped.sourceMap[generatedEnd])).toBe(
      "Texto [[Guia|la guía]] %%oculto%%.",
    );
  });

  it("maps a block consisting entirely of a transformed wikilink", () => {
    const source = "Antes\n\n[[Guia|Abrir guía]]\n\nDespués";
    let mapped = { text: source, sourceMap: identitySourceMap(source.length) };
    mapped = transformWithSourceMap(
      mapped.text,
      mapped.sourceMap,
      /(!)?\[\[([^\]]+?)\]\]/g,
      () => "[Abrir guía](granate:Guia)",
    );
    const start = mapped.text.indexOf("[Abrir guía]");
    const end = start + "[Abrir guía](granate:Guia)".length;
    expect(source.slice(mapped.sourceMap[start], mapped.sourceMap[end])).toBe("[[Guia|Abrir guía]]");
  });

  it("replaces only the selected source block and rejects stale offsets", () => {
    const source = "# Encabezado\n\nPárrafo sin editar.\n\nOtro párrafo.";
    const start = source.indexOf("Otro párrafo.");
    const end = start + "Otro párrafo.".length;
    expect(replaceSourceRange(source, start, end, "Otro párrafo.", "Bloque editado.")).toBe(
      "# Encabezado\n\nPárrafo sin editar.\n\nBloque editado.",
    );
    expect(replaceSourceRange(source, start, end, "texto obsoleto", "cambio")).toBeNull();
  });
});
