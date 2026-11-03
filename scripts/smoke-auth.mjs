const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3106";
let cookie = "";

async function api(path, init = {}) {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(init.body && typeof init.body === "string" ? { "Content-Type": "application/json" } : {}),
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
  return { status: response.status, data };
}

function assert(condition, message) {
  if (!condition) throw new Error(`✖ ${message}`);
  console.log(`✔ ${message}`);
}

async function main() {
  const email = `smoke-${Date.now()}@granate.local`;
  const register = await api("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ name: "Smoke User", email, password: "Prueba1234" }),
  });
  assert(register.status === 200, "registro abierto con email/contraseña");

  const duplicate = await api("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ name: "Smoke User", email, password: "Prueba1234" }),
  });
  assert(duplicate.status === 409, "email duplicado rechazado");

  const vault = await api("/api/v1/vaults", {
    method: "POST",
    body: JSON.stringify({ name: "Smoke auth vault" }),
  });
  assert(vault.status === 200, "crear bóveda autenticado");
  const vaultId = vault.data.vault.id;

  const note = await api(`/api/v1/vaults/${vaultId}/notes`, {
    method: "POST",
    body: JSON.stringify({ path: "Temp.md", content: "# Temp\n#etiqueta\n" }),
  });
  assert(note.status === 200, "crear nota");

  const tags = await api(`/api/v1/vaults/${vaultId}/tags`);
  assert(tags.data.tags.some((tag) => tag.name === "etiqueta"), "tag inline indexado");

  const tagSearch = await api(`/api/v1/vaults/${vaultId}/search?q=Temp&tag=etiqueta`);
  assert(tagSearch.status === 200 && tagSearch.data.hits.length === 1, "búsqueda con filtro de tag");

  await api(`/api/v1/vaults/${vaultId}/notes/${note.data.note.id}`, { method: "DELETE" });
  const trash = await api(`/api/v1/vaults/${vaultId}/notes?trash=1`);
  assert(trash.data.notes.length === 1, "nota en papelera");

  await api(`/api/v1/vaults/${vaultId}/notes/${note.data.note.id}?restore=1`, {
    method: "DELETE",
  });
  const restored = await api(`/api/v1/vaults/${vaultId}/notes?path=Temp.md`);
  assert(restored.status === 200, "restaurar desde papelera");

  const logout = await api("/api/auth/logout", { method: "POST" });
  assert(logout.status === 200, "cerrar sesión");
  const afterLogout = await api("/api/v1/vaults");
  assert(afterLogout.status === 401, "API privada tras logout");

  await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password: "Prueba1234" }),
  });
  await api(`/api/v1/vaults/${vaultId}`, { method: "DELETE" });
  console.log("\nAuth/trash OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
