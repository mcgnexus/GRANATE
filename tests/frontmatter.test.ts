import { describe, expect, it } from "vitest";
import {
  collectTags,
  extractOutline,
  getAliases,
  parseFrontmatter,
  serializeFrontmatter,
} from "@/lib/markdown/frontmatter";

describe("frontmatter", () => {
  it("parses YAML and keeps the body intact", () => {
    const raw = "---\ntitle: Hola\ntags:\n  - sensores\n  - riego\naliases: [Inicio]\n---\n\n# Hola\n";
    const parsed = parseFrontmatter(raw);
    expect(parsed.hasFrontmatter).toBe(true);
    expect(parsed.frontmatter.title).toBe("Hola");
    expect(parsed.body.trim()).toBe("# Hola");
    expect(getAliases(parsed.frontmatter)).toEqual(["Inicio"]);
  });

  it("returns the raw body when there is no frontmatter", () => {
    const parsed = parseFrontmatter("# Solo cuerpo\n");
    expect(parsed.hasFrontmatter).toBe(false);
    expect(parsed.body).toBe("# Solo cuerpo\n");
  });

  it("serializes without losing body content", () => {
    const raw = serializeFrontmatter({ tags: ["a"] }, "# Nota\n");
    expect(raw).toContain("tags:");
    expect(raw.endsWith("# Nota\n")).toBe(true);
  });

  it("collects frontmatter and inline tags, ignoring URLs and code", () => {
    const tags = collectTags(
      { tags: ["sensores", "#riego"] },
      "Texto #campo https://ejemplo.com/#no-es-tag\n```\n#codigo\n```\n",
    );
    expect(tags).toEqual(["campo", "riego", "sensores"]);
  });

  it("extracts headings as an outline", () => {
    const outline = extractOutline("# Uno\n\n## Dos\n```\n# no\n```\n");
    expect(outline).toEqual([
      { level: 1, text: "Uno", line: 1 },
      { level: 2, text: "Dos", line: 3 },
    ]);
  });
});
