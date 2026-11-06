// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarkdownPreview } from "@/components/workspace/markdown-preview";

const onOpenNote = vi.fn();

function renderMarkdown(content: string) {
  return render(
    <MarkdownPreview content={content} vaultId="v1" onOpenNote={onOpenNote} />,
  );
}

afterEach(() => {
  cleanup();
  onOpenNote.mockClear();
});

describe("MarkdownPreview urlTransform", () => {
  it("conserva enlaces relativos como ./doc.pdf", () => {
    renderMarkdown("[doc](./doc.pdf)");
    const link = screen.getByRole("link", { name: "doc" });
    expect(link).toHaveAttribute("href", "./doc.pdf");
  });

  it("resuelve embeds de imagen [[...]] a la API de adjuntos", () => {
    renderMarkdown("![[" + "esquema.png]]");
    const image = screen.getByAltText("esquema.png");
    expect(image.getAttribute("src")).toBe(
      "/api/v1/vaults/v1/attachments?path=esquema.png",
    );
  });

  it("conserva rutas de imagen relativas en Markdown normal", () => {
    renderMarkdown("![foto](./img/foto.jpg)");
    const image = screen.getByAltText("foto");
    expect(image.getAttribute("src")).toBe("./img/foto.jpg");
  });

  it("bloquea enlaces javascript: (se renderizan sin href)", () => {
    renderMarkdown("[mal](javascript:alert(1))");
    const link = screen.getByText("mal");
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBeNull();
  });

  it("bloquea URLs con protocolo desconocido", () => {
    renderMarkdown("[raro](vbscript:msgbox)");
    const link = screen.getByText("raro");
    expect(link.getAttribute("href")).toBeNull();
  });

  it("conserva enlaces http y anchors", () => {
    renderMarkdown("[web](https://example.com) [sección](#intro)");
    expect(screen.getByRole("link", { name: "web" })).toHaveAttribute(
      "href",
      "https://example.com",
    );
    expect(screen.getByRole("link", { name: "sección" })).toHaveAttribute(
      "href",
      "#intro",
    );
  });
});

describe("MarkdownPreview enlaces internos", () => {
  it("convierte [[wiki links]] y abre la nota destino", async () => {
    renderMarkdown("Ver [[Nota Uno|la primera nota]].");
    const link = screen.getByRole("link", { name: "la primera nota" });
    expect(link).toHaveClass("wiki-link");
    await userEvent.click(link);
    expect(onOpenNote).toHaveBeenCalledWith("Nota Uno");
  });
});
