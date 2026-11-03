#!/usr/bin/env node
/**
 * Minimal MCP stdio server for GRANATE.
 *
 * Environment:
 *   GRANATE_URL    Base URL, e.g. https://granate-five.vercel.app
 *   GRANATE_TOKEN  API token created in Ajustes → Tokens de API
 *   GRANATE_VAULT  Optional default vault id
 */
import { createInterface } from "node:readline";

const URL_BASE = (process.env.GRANATE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const TOKEN = process.env.GRANATE_TOKEN ?? "";
let defaultVault = process.env.GRANATE_VAULT ?? "";

const tools = [
  {
    name: "granate_list_vaults",
    description: "Lista las bóvedas disponibles con su id y rol.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "granate_search",
    description: "Busca notas por texto o semánticamente en una bóveda.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Texto a buscar" },
        vault_id: { type: "string", description: "Id de bóveda (opcional)" },
      },
      required: ["query"],
    },
  },
  {
    name: "granate_read_note",
    description: "Lee una nota Markdown por su ruta dentro de la bóveda.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Ruta, por ejemplo Proyectos/Idea.md" },
        vault_id: { type: "string" },
      },
      required: ["path"],
    },
  },
  {
    name: "granate_write_note",
    description: "Crea o reemplaza una nota Markdown. Requiere permiso de escritura.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        content: { type: "string" },
        vault_id: { type: "string" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "granate_list_tags",
    description: "Lista las etiquetas de la bóveda con su número de notas.",
    inputSchema: {
      type: "object",
      properties: { vault_id: { type: "string" } },
    },
  },
];

async function api(pathname, init = {}) {
  if (!TOKEN) throw new Error("Falta GRANATE_TOKEN en el entorno del servidor MCP.");
  const response = await fetch(`${URL_BASE}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!response.ok) throw new Error(data.error ?? `${response.status} ${response.statusText}`);
  return data;
}

async function resolveVault(explicit) {
  if (explicit) return explicit;
  if (defaultVault) return defaultVault;
  const data = await api("/api/v1/vaults");
  if (!data.vaults?.length) throw new Error("No hay bóvedas disponibles.");
  defaultVault = data.vaults[0].id;
  return defaultVault;
}

async function callTool(name, args = {}) {
  if (name === "granate_list_vaults") {
    const data = await api("/api/v1/vaults");
    return data.vaults
      .map((vault) => `${vault.id}  ${vault.name}  (${vault.role})`)
      .join("\n");
  }

  if (name === "granate_search") {
    const vaultId = await resolveVault(args.vault_id);
    const data = await api(
      `/api/v1/vaults/${vaultId}/search?q=${encodeURIComponent(args.query ?? "")}`,
    );
    if (!data.hits?.length) return "Sin resultados.";
    return data.hits
      .map(
        (hit) =>
          `■ ${hit.path}  [${hit.source}]\n  ${(hit.snippet ?? "").replace(/<[^>]+>/g, "").slice(0, 220)}`,
      )
      .join("\n\n");
  }

  if (name === "granate_read_note") {
    const vaultId = await resolveVault(args.vault_id);
    const data = await api(
      `/api/v1/vaults/${vaultId}/notes?path=${encodeURIComponent(args.path ?? "")}`,
    );
    return data.note.content;
  }

  if (name === "granate_write_note") {
    const vaultId = await resolveVault(args.vault_id);
    const existing = await fetch(
      `${URL_BASE}/api/v1/vaults/${vaultId}/notes?path=${encodeURIComponent(args.path ?? "")}`,
      { headers: { Authorization: `Bearer ${TOKEN}` } },
    );
    if (existing.ok) {
      const data = await existing.json();
      const updated = await api(`/api/v1/vaults/${vaultId}/notes/${data.note.id}`, {
        method: "PATCH",
        body: JSON.stringify({ content: args.content ?? "" }),
      });
      return `Actualizada ${updated.note.path}`;
    }
    const created = await api(`/api/v1/vaults/${vaultId}/notes`, {
      method: "POST",
      body: JSON.stringify({ path: args.path, content: args.content ?? "" }),
    });
    return `Creada ${created.note.path}`;
  }

  if (name === "granate_list_tags") {
    const vaultId = await resolveVault(args.vault_id);
    const data = await api(`/api/v1/vaults/${vaultId}/tags`);
    return data.tags.map((tag) => `#${tag.name} (${tag.count})`).join("\n") || "Sin etiquetas.";
  }

  throw new Error(`Herramienta desconocida: ${name}`);
}

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

const rl = createInterface({ input: process.stdin });

rl.on("line", async (line) => {
  if (!line.trim()) return;
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }

  const { id, method, params } = message;
  if (method === "notifications/initialized") return;

  try {
    if (method === "initialize") {
      send({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "granate", version: "1.0.0" },
        },
      });
    } else if (method === "ping") {
      send({ jsonrpc: "2.0", id, result: {} });
    } else if (method === "tools/list") {
      send({ jsonrpc: "2.0", id, result: { tools } });
    } else if (method === "tools/call") {
      try {
        const text = await callTool(params?.name, params?.arguments ?? {});
        send({
          jsonrpc: "2.0",
          id,
          result: { content: [{ type: "text", text }], isError: false },
        });
      } catch (error) {
        send({
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
            isError: true,
          },
        });
      }
    } else {
      send({
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Método no soportado: ${method}` },
      });
    }
  } catch (error) {
    send({
      jsonrpc: "2.0",
      id,
      error: { code: -32603, message: error instanceof Error ? error.message : String(error) },
    });
  }
});

rl.on("close", () => process.exit(0));
