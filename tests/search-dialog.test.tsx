// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SearchDialog } from "@/components/workspace/search-dialog";

type FetchMock = ReturnType<typeof vi.fn>;

const onOpenNote = vi.fn();
const onClose = vi.fn();

async function writeQuery(text: string) {
  const input = screen.getByLabelText("Buscar en la bóveda");
  await userEvent.type(input, text);
}

beforeEach(() => {
  onOpenNote.mockClear();
  onClose.mockClear();
  vi.stubGlobal("fetch", vi.fn() as FetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderDialog() {
  render(
    <SearchDialog open onClose={onClose} vaultId="v1" onOpenNote={onOpenNote} />,
  );
}

describe("SearchDialog", () => {
  it("muestra error en lugar de «Sin resultados» cuando la API responde 500", async () => {
    const fetchMock = vi.fn(async () => new Response("boom", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    renderDialog();
    await writeQuery("hola mundo");

    expect(await screen.findByText(/No se pudo completar la búsqueda/i)).toBeInTheDocument();
    expect(screen.queryByText(/Sin resultados/i)).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [firstUrl] = fetchMock.mock.calls[0] as unknown as [string];
    expect(firstUrl).toContain("/api/v1/vaults/v1/search?q=");
  });

  it("muestra error cuando la red falla", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("fallo de red");
    });
    vi.stubGlobal("fetch", fetchMock);
    renderDialog();
    await writeQuery("hola mundo");

    expect(await screen.findByText(/No se pudo completar la búsqueda/i)).toBeInTheDocument();
    expect(screen.queryByText(/Sin resultados/i)).not.toBeInTheDocument();
  });

  it("muestra «Sin resultados» con una respuesta vacía correcta", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ hits: [] }),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderDialog();
    await writeQuery("hola mundo");

    expect(await screen.findByText(/Sin resultados/i)).toBeInTheDocument();
    expect(screen.queryByText(/No se pudo completar/i)).not.toBeInTheDocument();
  });

  it("lista los resultados y abre la nota al hacer clic", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        hits: [
          {
            id: "n1",
            path: "Guías/Recetas.md",
            title: "Recetas",
            snippet: "Gambas al ajillo…",
            source: "fulltext",
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderDialog();
    await writeQuery("gambas");

    const hit = await screen.findByText("Recetas");
    expect(hit).toBeInTheDocument();
    expect(screen.queryByText(/Sin resultados/i)).not.toBeInTheDocument();

    await userEvent.click(hit);
    expect(onOpenNote).toHaveBeenCalledWith("Guías/Recetas.md");
    expect(onClose).toHaveBeenCalled();
  });
});
