#!/usr/bin/env node
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_DIR = join(homedir(), ".granate");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

const HELP = `GRANATE CLI

Uso:
  granate login --url <https://tu-app.vercel.app> --token <token>
  granate whoami
  granate vaults
  granate ls [--vault <id>] [ruta]
  granate search <texto> [--vault <id>]
  granate get <ruta> [--vault <id>]
  granate put <ruta> [--file <archivo>] [--vault <id>]
  granate ask <pregunta> [--vault <id>]
  granate export <salida.zip> [--vault <id>]
  granate import <boveda.zip> [--vault <id>]

El token se crea en Ajustes → Tokens de API.
`;

async function loadConfig() {
  try {
    return JSON.parse(await readFile(CONFIG_FILE, "utf8"));
  } catch {
    return null;
  }
}

async function saveConfig(config) {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), "utf8");
}

function parseArgs(argv) {
  const options = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        options[key] = next;
        i++;
      } else {
        options[key] = true;
      }
    } else {
      positional.push(arg);
    }
  }
  return { options, positional };
}

function fail(message) {
  console.error(`✖ ${message}`);
  process.exit(1);
}

async function request(config, pathname, init = {}) {
  const response = await fetch(`${config.url}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.token}`,
      ...(init.body && !(init.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    const text = await response.text();
    let message = text;
    try {
      message = JSON.parse(text).error ?? text;
    } catch {
      // keep text
    }
    throw new Error(`${response.status}: ${message}`);
  }
  return response;
}

async function resolveVault(config, explicit) {
  if (explicit) return explicit;
  if (config.vault) return config.vault;
  const response = await request(config, "/api/v1/vaults");
  const data = await response.json();
  if (!data.vaults?.length) fail("No tienes bóvedas. Crea una en la web.");
  return data.vaults[0].id;
}

const commands = {
  async login({ options }) {
    if (!options.url || !options.token) fail("Uso: granate login --url <url> --token <token>");
    const config = { url: String(options.url).replace(/\/$/, ""), token: String(options.token) };
    const response = await fetch(`${config.url}/api/v1/vaults`, {
      headers: { Authorization: `Bearer ${config.token}` },
    });
    if (!response.ok) fail("El token o la URL no son válidos.");
    const data = await response.json();
    config.vault = data.vaults?.[0]?.id;
    await saveConfig(config);
    console.log(`✔ Conectado a ${config.url}`);
    console.log(`  Bóvedas: ${data.vaults.map((vault) => vault.name).join(", ") || "ninguna"}`);
  },

  async whoami({ config }) {
    if (!config) fail("Ejecuta primero: granate login --url <url> --token <token>");
    const response = await request(config, "/api/v1/vaults");
    const data = await response.json();
    console.log(`URL: ${config.url}`);
    console.log(`Bóvedas: ${data.vaults.length}`);
    for (const vault of data.vaults) console.log(`  ${vault.id}  ${vault.name} (${vault.role})`);
  },

  async vaults({ config }) {
    const response = await request(config, "/api/v1/vaults");
    const data = await response.json();
    for (const vault of data.vaults) console.log(`${vault.id}  ${vault.name}  (${vault.role})`);
  },

  async ls({ config, options, positional }) {
    const vaultId = await resolveVault(config, options.vault);
    const response = await request(config, `/api/v1/vaults/${vaultId}/tree`);
    const data = await response.json();
    const prefix = (positional[0] ?? "").replace(/^\/|\/$/g, "");
    for (const note of data.notes) {
      if (prefix && !note.path.startsWith(prefix)) continue;
      console.log(note.path);
    }
  },

  async search({ config, options, positional }) {
    const query = positional.join(" ");
    if (!query) fail("Uso: granate search <texto>");
    const vaultId = await resolveVault(config, options.vault);
    const response = await request(
      config,
      `/api/v1/vaults/${vaultId}/search?q=${encodeURIComponent(query)}`,
    );
    const data = await response.json();
    for (const hit of data.hits) {
      console.log(`\n■ ${hit.path}  [${hit.source}]`);
      if (hit.snippet) console.log(`  ${hit.snippet.replace(/<[^>]+>/g, "").slice(0, 180)}`);
    }
    if (!data.hits.length) console.log("Sin resultados.");
  },

  async get({ config, options, positional }) {
    const path = positional.join(" ");
    if (!path) fail("Uso: granate get <ruta>");
    const vaultId = await resolveVault(config, options.vault);
    const response = await request(
      config,
      `/api/v1/vaults/${vaultId}/notes?path=${encodeURIComponent(path)}`,
    );
    const data = await response.json();
    process.stdout.write(data.note.content);
  },

  async put({ config, options, positional }) {
    const path = positional.join(" ");
    if (!path) fail("Uso: granate put <ruta> [--file <archivo>]");
    const vaultId = await resolveVault(config, options.vault);
    const content = options.file ? await readFile(String(options.file), "utf8") : await readStdin();
    if (!content) fail("No hay contenido (usa --file o pipe por stdin).");

    const existing = await fetch(
      `${config.url}/api/v1/vaults/${vaultId}/notes?path=${encodeURIComponent(path)}`,
      { headers: { Authorization: `Bearer ${config.token}` } },
    );

    if (existing.ok) {
      const data = await existing.json();
      await request(config, `/api/v1/vaults/${vaultId}/notes/${data.note.id}`, {
        method: "PATCH",
        body: JSON.stringify({ content }),
      });
      console.log(`✔ Actualizada ${path}`);
    } else {
      await request(config, `/api/v1/vaults/${vaultId}/notes`, {
        method: "POST",
        body: JSON.stringify({ path, content }),
      });
      console.log(`✔ Creada ${path}`);
    }
  },

  async ask({ config, options, positional }) {
    const question = positional.join(" ");
    if (!question) fail("Uso: granate ask <pregunta>");
    const vaultId = await resolveVault(config, options.vault);
    const response = await request(config, `/api/v1/vaults/${vaultId}/chat`, {
      method: "POST",
      body: JSON.stringify({ question }),
    });
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let citations = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() ?? "";
      for (const block of blocks) {
        const line = block.split("\n").find((item) => item.startsWith("data:"));
        if (!line) continue;
        try {
          const event = JSON.parse(line.slice(5).trim());
          if (event.type === "citations") citations = event.citations;
          if (event.type === "delta") process.stdout.write(event.text);
        } catch {
          // ignore
        }
      }
    }
    console.log("");
    if (citations.length) {
      console.log("\nFuentes:");
      for (const citation of citations) console.log(`  [${citation.index}] ${citation.path}`);
    }
  },

  async export({ config, options, positional }) {
    const output = positional[0] ?? "granate-export.zip";
    const vaultId = await resolveVault(config, options.vault);
    const response = await request(config, `/api/v1/vaults/${vaultId}/export`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    await writeFile(output, bytes);
    console.log(`✔ Exportado a ${output} (${bytes.byteLength} bytes)`);
  },

  async import({ config, options, positional }) {
    const file = positional[0];
    if (!file) fail("Uso: granate import <boveda.zip>");
    const vaultId = await resolveVault(config, options.vault);
    const bytes = await readFile(file);
    const form = new FormData();
    form.append("file", new Blob([bytes], { type: "application/zip" }), "vault.zip");
    const response = await request(config, `/api/v1/vaults/${vaultId}/import`, {
      method: "POST",
      body: form,
    });
    const data = await response.json();
    console.log(`✔ Importadas ${data.report?.notes ?? 0} notas.`);
  },
};

async function readStdin() {
  if (process.stdin.isTTY) return "";
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function main() {
  const [, , command = "help", ...rest] = process.argv;
  if (command === "help" || command === "--help" || command === "-h") {
    console.log(HELP);
    return;
  }
  const handler = commands[command];
  if (!handler) {
    console.error(`Comando desconocido: ${command}\n`);
    console.log(HELP);
    process.exit(1);
  }
  const { options, positional } = parseArgs(rest);
  const config = await loadConfig();
  if (command !== "login" && !config) {
    fail("No hay configuración. Ejecuta: granate login --url <url> --token <token>");
  }
  try {
    await handler({ config, options, positional });
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

main();
