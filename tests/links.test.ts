import { describe, expect, it } from "vitest";
import { parseLinks, resolveLink, rewriteLinks } from "@/lib/markdown/links";

const notes = [
  { id: "1", path: "10 - TecRural/Guia.md", aliases: ["Guía"] },
  { id: "2", path: "20 - Sensores/Humedad.md", aliases: [] },
  { id: "3", path: "Archivo/Humedad.md", aliases: [] },
  { id: "4", path: "Humedad.md", aliases: [] },
];

describe("links", () => {
  it("parses wikilinks with heading and alias", () => {
    const [link] = parseLinks("Ver [[Guia#Sección|la guía]] y ![[foto.png]]");
    expect(link.target).toBe("Guia");
    expect(link.heading).toBe("Sección");
    expect(link.alias).toBe("la guía");
  });

  it("resolves by path, basename and alias", () => {
    expect(resolveLink("10 - TecRural/Guia", "x.md", notes)?.id).toBe("1");
    expect(resolveLink("Guia", "x.md", notes)?.id).toBe("1");
    expect(resolveLink("Guía", "x.md", notes)?.id).toBe("1");
  });

  it("prefers the shortest path for duplicate basenames", () => {
    expect(resolveLink("Humedad", "x.md", notes)?.id).toBe("4");
  });

  it("rewrites only links pointing to the moved note", () => {
    const body = "[[Guia]] y [[Humedad|sensor]] y [[Guia#Tema|alias]]";
    const next = rewriteLinks(body, "10 - TecRural/Guia.md", "10 - TecRural/Nueva guia.md", notes);
    expect(next).toBe("[[10 - TecRural/Nueva guia]] y [[Humedad|sensor]] y [[10 - TecRural/Nueva guia#Tema|alias]]");
  });
});
