import JSZip from "jszip";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3104";
const VAULT_DIR = process.env.OBSIDIAN_VAULT ?? "C:/Users/Manuel Q/Documents/Obsidian Vault";
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

async function addFolder(zip, dir, base) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    const rel = relative(base, full).replaceAll("\\", "/");
    if (entry.isDirectory()) {
      await addFolder(zip, full, base);
    } else {
      zip.file(rel, await readFile(full));
    }
  }
}

async function main() {
  const login = await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "demo@granate.local", password: "granate123" }),
  });
  if (login.status !== 200) throw new Error("login failed");

  const created = await api("/api/v1/vaults", {
    method: "POST",
    body: JSON.stringify({ name: "Obsidian import test" }),
  });
  const vaultId = created.data.vault.id;

  const zip = new JSZip();
  await addFolder(zip, VAULT_DIR, VAULT_DIR);
  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  console.log(`ZIP de prueba: ${(buffer.length / 1024 / 1024).toFixed(2)} MB`);

  const form = new FormData();
  form.append("file", new Blob([buffer], { type: "application/zip" }), "vault.zip");
  const imported = await api(`/api/v1/vaults/${vaultId}/import`, { method: "POST", body: form });
  console.log("Import:", imported.status, imported.data.report ?? imported.data.error);
  if (imported.status !== 200) throw new Error("import failed");

  const tree = await api(`/api/v1/vaults/${vaultId}/tree`);
  console.log(`Notas: ${tree.data.notes.length}`);
  console.log(`Carpetas: ${tree.data.folders.length}`);
  console.log(`Tags: ${tree.data.tags.length}`);
  console.log(`Primeras rutas:`, tree.data.notes.slice(0, 4).map((n) => n.path));

  const search = await api(
    `/api/v1/vaults/${vaultId}/search?q=${encodeURIComponent("TecRural")}`,
  );
  console.log(`Búsqueda "TecRural": ${search.data.hits?.length ?? 0} resultados`);

  const note = tree.data.notes.find((n) => n.path.includes("Bienvenido")) ?? tree.data.notes[0];
  const detail = await api(`/api/v1/vaults/${vaultId}/notes/${note.id}`);
  console.log(
    `Nota ${note.path}: ${detail.data.note.backlinks.length} backlinks, ${detail.data.note.outgoing.length} salientes, tags=${detail.data.note.tags.join(",")}`,
  );

  const exported = await fetch(`${BASE}/api/v1/vaults/${vaultId}/export`, {
    headers: { Cookie: cookie },
  });
  const exportedBytes = new Uint8Array(await exported.arrayBuffer());
  console.log(`Export: ${(exportedBytes.byteLength / 1024 / 1024).toFixed(2)} MB`);

  await api(`/api/v1/vaults/${vaultId}`, { method: "DELETE" });
  console.log("\nImport real OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
