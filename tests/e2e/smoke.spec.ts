import { expect, test } from "@playwright/test";

const EMAIL = process.env.GRANATE_E2E_EMAIL;
const PASSWORD = process.env.GRANATE_E2E_PASSWORD;
const hasCredentials = Boolean(EMAIL && PASSWORD);

type Vault = { id: string; name: string };

test.describe("GRANATE flujo principal", () => {
  test.skip(!hasCredentials, "Define GRANATE_E2E_EMAIL y GRANATE_E2E_PASSWORD");

  test("login, carpetas, arrastrar, etiquetas, historial y propiedades", async ({
    page,
    request,
    baseURL,
  }) => {
    const login = await request.post(`${baseURL}/api/auth/login`, {
      data: { email: EMAIL, password: PASSWORD },
    });
    expect(login.ok()).toBeTruthy();
    const cookies = login.headers()["set-cookie"] ?? "";
    const cookie = cookies
      .split("\n")
      .map((value) => value.split(";")[0])
      .join("; ");

    const name = `E2E ${Date.now()}`;
    const vaultResponse = await request.post(`${baseURL}/api/v1/vaults`, {
      headers: { cookie },
      data: { name },
    });
    expect(vaultResponse.ok()).toBeTruthy();
    const vault = (await vaultResponse.json()).vault as Vault;

    const noteResponse = await request.post(`${baseURL}/api/v1/vaults/${vault.id}/notes`, {
      headers: { cookie },
      data: { path: "Prueba.md", content: "# Prueba\n\n#inicial\n" },
    });
    expect(noteResponse.ok()).toBeTruthy();
    const note = (await noteResponse.json()).note as { id: string };

    try {
      await page.goto("/login");
      await page.fill('input[type="email"]', EMAIL!);
      await page.fill('input[type="password"]', PASSWORD!);
      await page.click('button[type="submit"]');
      await page.waitForURL("**/vaults");

      await page.locator("div.panel").filter({ hasText: name }).first().getByText("Abrir", { exact: true }).click();
      await page.waitForURL("**/vaults/**");
      await expect(page.locator("aside").getByText("Prueba", { exact: true })).toBeVisible();

      await page.locator('button[title="Nueva carpeta"]').click();
      await page.getByPlaceholder("Carpeta/Subcarpeta").fill("Destino");
      await page.getByRole("button", { name: "Crear carpeta", exact: true }).click();
      await expect(page.locator("aside").getByText("Destino", { exact: true })).toBeVisible();

      const source = page.locator('aside button[title^="Prueba.md"]').first();
      const folder = page.locator("aside button").filter({ hasText: "Destino" }).first();
      await source.dragTo(folder);
      await expect
        .poll(async () => {
          const response = await request.get(
            `${baseURL}/api/v1/vaults/${vault.id}/notes/${note.id}`,
            { headers: { cookie } },
          );
          return (await response.json()).note.path;
        })
        .toBe("Destino/Prueba.md");

      await page.locator('aside button[title^="Destino/Prueba.md"]').click({ button: "right" });
      await page.getByRole("menuitem", { name: "Etiquetar" }).click();
      await page.getByPlaceholder("etiqueta").fill("e2e");
      await page.getByRole("button", { name: "Añadir", exact: true }).click();

      await expect
        .poll(async () => {
          const response = await request.get(
            `${baseURL}/api/v1/vaults/${vault.id}/notes/${note.id}`,
            { headers: { cookie } },
          );
          return (await response.json()).note.tags.join(",");
        })
        .toContain("e2e");

      await page.locator('aside button[title^="Destino/Prueba.md"]').click();
      await page.getByRole("heading", { name: "Prueba", exact: true }).click();
      let blockEditor = page.getByRole("textbox", { name: "Editar bloque Markdown" });
      await expect(blockEditor).toHaveValue("# Prueba");
      await blockEditor.fill("# Prueba descartada");
      await blockEditor.press("Escape");
      await expect(page.getByRole("heading", { name: "Prueba", exact: true })).toBeVisible();

      await page.getByRole("heading", { name: "Prueba", exact: true }).click();
      blockEditor = page.getByRole("textbox", { name: "Editar bloque Markdown" });
      await blockEditor.fill("# Prueba actualizada");
      await page.locator(".prose-granate").getByText("#inicial", { exact: true }).click();
      await expect(page.getByRole("heading", { name: "Prueba actualizada", exact: true })).toBeVisible();
      await expect(page.getByRole("textbox", { name: "Editar bloque Markdown" })).toHaveValue("#inicial");
      await page.getByRole("textbox", { name: "Editar bloque Markdown" }).press("Escape");
      await expect
        .poll(async () => {
          const response = await request.get(`${baseURL}/api/v1/vaults/${vault.id}/notes/${note.id}`, {
            headers: { cookie },
          });
          return (await response.json()).note.content as string;
        })
        .toContain("# Prueba actualizada");

      await page.getByRole("button", { name: "Historial" }).click();
      await expect(page.getByText("Historial de versiones")).toBeVisible();
      await page.keyboard.press("Escape");

      await page.getByRole("button", { name: "Editar", exact: true }).click();
      await expect(page.getByText("Propiedades de la nota")).toBeVisible();
      await page.getByRole("button", { name: "Añadir propiedad" }).click();
      await page.getByPlaceholder("clave").last().fill("estado");
      await page.getByPlaceholder("valor").last().fill("activo");
      await page.getByRole("button", { name: "Guardar propiedades" }).click();
      await expect
        .poll(async () => {
          const response = await request.get(
            `${baseURL}/api/v1/vaults/${vault.id}/notes/${note.id}`,
            { headers: { cookie } },
          );
          return (await response.json()).note.frontmatter.estado;
        })
        .toBe("activo");
    } finally {
      await request.delete(`${baseURL}/api/v1/vaults/${vault.id}`, {
        headers: { cookie },
      });
    }
  });
});
