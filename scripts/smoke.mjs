const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3103";
let cookie = "";

async function api(path, init = {}) {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(init.body && typeof init.body === "string" ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  const setCookie = response.headers.getSetCookie?.() ?? [];
  if (setCookie.length) cookie = setCookie.map((value) => value.split(";")[0]).join("; ");
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: response.status, data, response };
}

function assert(condition, message) {
  if (!condition) throw new Error(`✖ ${message}`);
  console.log(`✔ ${message}`);
}

async function main() {
  const login = await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "demo@granate.local", password: "granate123" }),
  });
  assert(login.status === 200, "login demo");

  const { data: vaultData } = await api("/api/v1/vaults");
  assert(Array.isArray(vaultData.vaults) && vaultData.vaults.length > 0, "lista de bóvedas");

  const vault = vaultData.vaults[0];
  const tree = await api(`/api/v1/vaults/${vault.id}/tree`);
  assert(tree.status === 200 && tree.data.notes.length >= 4, `árbol con ${tree.data.notes?.length} notas`);
  assert(tree.data.folders.includes("Proyectos"), "carpeta Proyectos detectada");
  assert(tree.data.tags.some((tag) => tag.name === "sensores"), "tag sensores indexado");

  const sensores = tree.data.notes.find((note) => note.path === "Proyectos/Sensores.md");
  const note = await api(`/api/v1/vaults/${vault.id}/notes/${sensores.id}`);
  assert(note.status === 200 && note.data.note.backlinks.length >= 1, "nota con backlinks");
  assert(note.data.note.outgoing.some((link) => link.rawTarget === "AD5933"), "wikilinks salientes");

  const search = await api(`/api/v1/vaults/${vault.id}/search?q=sensores`);
  assert(search.status === 200 && search.data.hits.length > 0, "búsqueda full-text");

  const base = await api(`/api/v1/vaults/${vault.id}/bases?path=${encodeURIComponent("Proyectos/Base de proyectos.base")}`);
  assert(base.status === 200 && base.data.result.rows.length === 2, "base evalúa 2 proyectos");

  const canvas = await api(`/api/v1/vaults/${vault.id}/canvases`, {
    method: "POST",
    body: JSON.stringify({
      path: "Smoke.canvas",
      data: {
        nodes: [{ id: "n1", type: "text", x: 0, y: 0, width: 200, height: 100, text: "hola" }],
        edges: [],
      },
    }),
  });
  assert(canvas.status === 200 && canvas.data.canvas?.id, "crear canvas");

  const smokeVault = await api("/api/v1/vaults", {
    method: "POST",
    body: JSON.stringify({ name: "Smoke temporal" }),
  });
  assert(smokeVault.status === 200, "crear bóveda temporal");
  const smokeId = smokeVault.data.vault.id;

  const a = await api(`/api/v1/vaults/${smokeId}/notes`, {
    method: "POST",
    body: JSON.stringify({ path: "A.md", content: "# A\n" }),
  });
  await api(`/api/v1/vaults/${smokeId}/notes`, {
    method: "POST",
    body: JSON.stringify({ path: "B.md", content: "Enlaza [[A]].\n" }),
  });
  assert(a.status === 200, "crear notas temporales");

  const renamed = await api(`/api/v1/vaults/${smokeId}/notes/${a.data.note.id}`, {
    method: "PATCH",
    body: JSON.stringify({ path: "Carpeta/A renombrada.md" }),
  });
  assert(renamed.status === 200, "renombrar nota");

  const b = await api(`/api/v1/vaults/${smokeId}/notes?path=B.md`);
  assert(
    b.status === 200 && b.data.note.content.includes("[[Carpeta/A renombrada]]"),
    "los enlaces entrantes se reescriben",
  );

  const exportResponse = await fetch(`${BASE}/api/v1/vaults/${smokeId}/export`, {
    headers: { Cookie: cookie },
  });
  const bytes = new Uint8Array(await exportResponse.arrayBuffer());
  assert(exportResponse.ok && bytes.byteLength > 100, "exportar ZIP");

  const chat = await api(`/api/v1/vaults/${smokeId}/chat`, {
    method: "POST",
    body: JSON.stringify({ question: "hola" }),
  });
  assert(chat.status === 400, "chat sin OPENROUTER_API_KEY devuelve 400 controlado");

  await api(`/api/v1/vaults/${smokeId}`, { method: "DELETE" });
  console.log("\nTodo OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
