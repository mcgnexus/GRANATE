import { describe, expect, it } from "vitest";
import { hideComments } from "@/lib/markdown/comments";
import {
  findHeadingSection,
  removeSection,
  renameHeadingRange,
  stripFormatting,
  suggestNoteName,
  toggleHeadingTagRange,
  toggleListLines,
  toggleQuoteLines,
} from "@/lib/markdown/formatting";

describe("toggleListLines", () => {
  it("adds bullet lists", () => {
    expect(toggleListLines("uno\ndos", "bullet")).toBe("- uno\n- dos");
  });

  it("removes bullets when every line already has one (toggle)", () => {
    expect(toggleListLines("- uno\n- dos", "bullet")).toBe("uno\ndos");
  });

  it("converts bullet lists to numbered lists, counting non-empty lines", () => {
    expect(toggleListLines("- uno\n\n- dos", "number")).toBe("1. uno\n\n2. dos");
  });

  it("adds task lists", () => {
    expect(toggleListLines("comprar leche", "task")).toBe("- [ ] comprar leche");
  });

  it("converts numbered lists to task lists", () => {
    expect(toggleListLines("1. uno\n2) dos", "task")).toBe("- [ ] uno\n- [ ] dos");
  });

  it("skips empty lines when toggling off", () => {
    expect(toggleListLines("- uno\n\n- dos", "bullet")).toBe("uno\n\ndos");
  });

  it("preserves indentation", () => {
    expect(toggleListLines("  anidado", "bullet")).toBe("  - anidado");
  });
});

describe("toggleQuoteLines", () => {
  it("adds quotes", () => {
    expect(toggleQuoteLines("cita larga\ncorta")).toBe("> cita larga\n> corta");
  });

  it("removes quotes when every line is quoted (toggle)", () => {
    expect(toggleQuoteLines("> cita larga\n>corta")).toBe("cita larga\ncorta");
  });

  it("ignores empty lines", () => {
    expect(toggleQuoteLines("> uno\n\n> dos", )).toBe("uno\n\ndos");
  });
});

describe("stripFormatting", () => {
  it("removes headings, emphasis and inline code", () => {
    expect(stripFormatting("### Título\n**negrita** y *cursiva* y `código`")).toBe(
      "Título\nnegrita y cursiva y código",
    );
  });

  it("removes list markers and quotes", () => {
    expect(stripFormatting("- punto\n> cita")).toBe("punto\ncita");
  });

  it("keeps link text and wikilink alias", () => {
    expect(stripFormatting("[texto](https://x.com) y [[Guia|la guía]] y [[Guia]]")).toBe(
      "texto y la guía y Guia",
    );
  });

  it("removes images, color tags, math and comments", () => {
    expect(
      stripFormatting(
        '![alt](foto.png) <mark class="hl-red">rojo</mark> <span class="tx-blue">azul</span>',
      ),
    ).toBe("alt rojo azul");
    expect(stripFormatting("$$x^2$$ y $y$ y %%nota%% y ==resaltado==")).toBe(
      "x^2 y y y nota y resaltado",
    );
  });
});

describe("hideComments", () => {
  it("converts Obsidian comments to HTML comments", () => {
    expect(hideComments("Visible %%oculto%% fin")).toBe("Visible <!-- oculto --> fin");
  });

  it("supports multiline comments and neutralizes double dashes", () => {
    const output = hideComments("a %%línea1\nlínea2 -- guión%% b");
    expect(output).toBe("a <!-- línea1\nlínea2 · guión --> b");
  });
});

const HEADING_DOC = "# Alfa\n\ntexto a\n\n## Beta\n\ntexto b\n\n# Gamma\n\ntexto c\n";

describe("findHeadingSection", () => {
  it("finds the heading at the cursor and its section", () => {
    const found = findHeadingSection(HEADING_DOC, HEADING_DOC.indexOf("texto b"));
    expect(found?.level).toBe(2);
    expect(found?.title).toBe("Beta");
    expect(HEADING_DOC.slice(found!.sectionStart, found!.sectionEnd)).toBe(
      "## Beta\n\ntexto b\n\n",
    );
  });

  it("stops the section at the next heading of equal or higher level", () => {
    const found = findHeadingSection(HEADING_DOC, HEADING_DOC.indexOf("texto a"));
    expect(found?.title).toBe("Alfa");
    expect(HEADING_DOC.slice(found!.sectionStart, found!.sectionEnd)).toBe(
      "# Alfa\n\ntexto a\n\n## Beta\n\ntexto b\n\n",
    );
  });

  it("returns null when there is no heading above", () => {
    expect(findHeadingSection("solo texto", 4)).toBeNull();
  });

  it("cleans closing hashes from the title", () => {
    const found = findHeadingSection("## Título ##\n\ncuerpo", 2);
    expect(found?.title).toBe("Título");
  });
});

describe("renameHeadingRange", () => {
  it("renames keeping the heading level", () => {
    const range = renameHeadingRange(HEADING_DOC, HEADING_DOC.indexOf("texto b"), "Nuevo");
    expect(range).not.toBeNull();
    const updated = HEADING_DOC.slice(0, range!.from) + range!.insert + HEADING_DOC.slice(range!.to);
    expect(updated).toContain("## Nuevo\n\ntexto b");
  });

  it("returns null for empty titles or missing headings", () => {
    expect(renameHeadingRange(HEADING_DOC, 2, "   ")).toBeNull();
    expect(renameHeadingRange("sin encabezados", 3, "X")).toBeNull();
  });
});

describe("toggleHeadingTagRange", () => {
  it("adds the tag at the end of the heading line", () => {
    const range = toggleHeadingTagRange("## Beta\n\ncuerpo", 2);
    expect(range?.insert).toBe("## Beta #marcado");
  });

  it("removes the tag when it is already present", () => {
    const range = toggleHeadingTagRange("## Beta #marcado\n\ncuerpo", 2);
    expect(range?.insert).toBe("## Beta");
  });
});

describe("removeSection", () => {
  it("removes a middle section joining with a blank line", () => {
    const found = findHeadingSection(HEADING_DOC, HEADING_DOC.indexOf("texto b"))!;
    expect(removeSection(HEADING_DOC, found.sectionStart, found.sectionEnd)).toBe(
      "# Alfa\n\ntexto a\n\n# Gamma\n\ntexto c\n",
    );
  });

  it("removes the last section keeping a trailing newline", () => {
    const found = findHeadingSection(HEADING_DOC, HEADING_DOC.indexOf("texto c"))!;
    expect(removeSection(HEADING_DOC, found.sectionStart, found.sectionEnd)).toBe(
      "# Alfa\n\ntexto a\n\n## Beta\n\ntexto b\n",
    );
  });
});

describe("suggestNoteName", () => {
  it("removes formatting and illegal filename characters", () => {
    expect(suggestNoteName("**Mi** nota: ideas/finales #marcado")).toBe("Mi nota ideasfinales marcado");
  });

  it("falls back to a default name", () => {
    expect(suggestNoteName("...")).toBe("Sección");
  });
});
