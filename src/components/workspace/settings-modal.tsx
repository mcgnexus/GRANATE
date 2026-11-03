"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Download, KeyRound, Loader2, RefreshCw, Tag, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { PalettePicker } from "@/components/ui/palette-picker";
import { vaultTemplateSettings } from "@/lib/templates";

type Token = {
  id: string;
  name: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

export function SettingsModal({
  open,
  onClose,
  vaultId,
  vaultName,
  canWrite,
  isOwner,
  settings,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  vaultId: string;
  vaultName: string;
  canWrite: boolean;
  isOwner: boolean;
  settings: Record<string, unknown>;
  onChanged: () => void;
}) {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [newToken, setNewToken] = useState("");
  const [tokenName, setTokenName] = useState("CLI");
  const [loading, setLoading] = useState(false);
  const [indexStatus, setIndexStatus] = useState("");
  const [trash, setTrash] = useState<Array<{ id: string; path: string }>>([]);
  const [tags, setTags] = useState<Array<{ name: string; count: number }>>([]);
  const [templatesFolder, setTemplatesFolder] = useState("Plantillas");
  const [dailyFolder, setDailyFolder] = useState("Diario");
  const [dailyTemplate, setDailyTemplate] = useState("Plantillas/Diario.md");
  const [settingsStatus, setSettingsStatus] = useState("");
  const [vaultShares, setVaultShares] = useState<
    Array<{ id: string; url: string; expiresAt: string | null }>
  >([]);
  const [backupList, setBackupList] = useState<
    Array<{ id: string; blobUrl: string; size: number; noteCount: number; kind: string; createdAt: string }>
  >([]);
  const [storageProvider, setStorageProvider] = useState<"b2" | "vercel" | "postgres">(
    "postgres",
  );
  const [backupStatus, setBackupStatus] = useState("");
  const router = useRouter();

  const loadTags = useCallback(async () => {
    const response = await fetch(`/api/v1/vaults/${vaultId}/tags`);
    if (!response.ok) return;
    const data = (await response.json()) as { tags: Array<{ name: string; count: number }> };
    setTags(data.tags ?? []);
  }, [vaultId]);

  const loadVaultShares = useCallback(async () => {
    const response = await fetch(`/api/v1/vaults/${vaultId}/shares`);
    if (!response.ok) return;
    const data = (await response.json()) as {
      shares: Array<{ id: string; url: string; expiresAt: string | null; revokedAt: string | null }>;
    };
    setVaultShares((data.shares ?? []).filter((share) => !share.revokedAt));
  }, [vaultId]);

  const loadBackups = useCallback(async () => {
    const response = await fetch(`/api/v1/vaults/${vaultId}/backups`);
    if (!response.ok) return;
    const data = (await response.json()) as {
      backups: Array<{
        id: string;
        blobUrl: string;
        size: number;
        noteCount: number;
        kind: string;
        createdAt: string;
      }>;
      blob: boolean;
      storage?: "b2" | "vercel" | "postgres";
    };
    setBackupList(data.backups ?? []);
    setStorageProvider(data.storage ?? (data.blob ? "vercel" : "postgres"));
  }, [vaultId]);

  const loadTrash = useCallback(async () => {
    const response = await fetch(`/api/v1/vaults/${vaultId}/notes?trash=1`);
    if (!response.ok) return;
    const data = (await response.json()) as { notes: Array<{ id: string; path: string }> };
    setTrash(data.notes);
  }, [vaultId]);

  useEffect(() => {
    if (!open) return;
    void loadTokens();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga la papelera al abrir el modal
    void loadTrash();
    void loadTags();
    void loadVaultShares();
    void loadBackups();
  }, [open, loadTrash, loadTags, loadVaultShares, loadBackups]);

  useEffect(() => {
    if (!open) return;
    const templates = vaultTemplateSettings(settings);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- inicializa los ajustes al abrir
    setTemplatesFolder(templates.templatesFolder);
    setDailyFolder(templates.dailyFolder);
    setDailyTemplate(templates.dailyTemplate);
  }, [open, settings]);

  async function restoreNote(noteId: string) {
    await fetch(`/api/v1/vaults/${vaultId}/notes/${noteId}?restore=1`, { method: "DELETE" });
    await loadTrash();
    onChanged();
  }

  async function loadTokens() {
    const response = await fetch("/api/v1/tokens");
    if (!response.ok) return;
    const data = (await response.json()) as { tokens: Token[] };
    setTokens(data.tokens);
  }

  async function createToken() {
    setLoading(true);
    const response = await fetch("/api/v1/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: tokenName }),
    });
    const data = (await response.json()) as { token?: { token: string }; error?: string };
    if (data.token) {
      setNewToken(data.token.token);
      await loadTokens();
    }
    setLoading(false);
  }

  async function revoke(id: string) {
    await fetch(`/api/v1/tokens?id=${id}`, { method: "DELETE" });
    await loadTokens();
  }

  async function reindex() {
    setIndexStatus("Indexando lote…");
    const response = await fetch(`/api/v1/vaults/${vaultId}/index`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limit: 15 }),
    });
    const data = (await response.json()) as { indexed?: number; error?: string };
    setIndexStatus(data.error ?? `Indexadas ${data.indexed ?? 0} notas.`);
    onChanged();
  }

  async function renameTag(from: string) {
    const to = window.prompt(`Nuevo nombre para #${from} (si ya existe, se fusionan)`, from);
    if (!to || to === from) return;
    const response = await fetch(`/api/v1/vaults/${vaultId}/tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "rename", from, to }),
    });
    if (!response.ok) return;
    await loadTags();
    onChanged();
  }

  async function deleteTag(name: string) {
    if (!window.confirm(`¿Eliminar #${name} de todas las notas?`)) return;
    const response = await fetch(`/api/v1/vaults/${vaultId}/tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", name }),
    });
    if (!response.ok) return;
    await loadTags();
    onChanged();
  }

  async function saveTemplates() {
    setSettingsStatus("Guardando…");
    const response = await fetch(`/api/v1/vaults/${vaultId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        settings: {
          ...settings,
          templatesFolder: templatesFolder.trim(),
          dailyFolder: dailyFolder.trim(),
          dailyTemplate: dailyTemplate.trim(),
        },
      }),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      setSettingsStatus(data.error ?? "No se pudieron guardar los ajustes");
      return;
    }
    setSettingsStatus("Guardado.");
    onChanged();
    router.refresh();
  }

  async function createVaultShare() {
    const response = await fetch(`/api/v1/vaults/${vaultId}/shares`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = (await response.json().catch(() => ({}))) as {
      share?: { url: string };
      error?: string;
    };
    if (!response.ok || !data.share) {
      setSettingsStatus(data.error ?? "No se pudo crear el enlace");
      return;
    }
    await navigator.clipboard.writeText(data.share.url).catch(() => undefined);
    setSettingsStatus("Enlace de bóveda creado y copiado.");
    await loadVaultShares();
  }

  async function revokeVaultShare(id: string) {
    await fetch(`/api/v1/vaults/${vaultId}/shares?id=${id}`, { method: "DELETE" });
    await loadVaultShares();
  }

  async function createBackupNow() {
    setBackupStatus("Creando backup…");
    const response = await fetch(`/api/v1/vaults/${vaultId}/backups`, { method: "POST" });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    setBackupStatus(response.ok ? "Backup creado." : (data.error ?? "No se pudo crear el backup"));
    await loadBackups();
  }

  async function removeBackup(id: string) {
    await fetch(`/api/v1/vaults/${vaultId}/backups?id=${id}`, { method: "DELETE" });
    await loadBackups();
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <Modal open={open} onClose={onClose} title="Ajustes" subtitle={vaultName} wide>
      <div className="space-y-7 p-5">
        <section>
          <h3 className="text-sm font-medium">Apariencia</h3>
          <div className="mt-2 flex items-center gap-3 text-xs text-[var(--muted)]">
            Tema de la interfaz <ThemeToggle />
          </div>
          <div className="mt-4">
            <div className="mb-2 text-[11px] text-[var(--muted)]">Paleta de colores</div>
            <PalettePicker />
            <p className="mt-2 text-[10px] leading-4 text-[var(--muted)]">
              Se guarda en este navegador. Se aplica igual en modo claro y oscuro.
            </p>
          </div>
        </section>

        <section>
          <h3 className="text-sm font-medium">Bóveda</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            <a href={`/api/v1/vaults/${vaultId}/export`} className="btn text-xs">
              <Download size={14} /> Exportar ZIP
            </a>
            {canWrite ? (
              <button type="button" onClick={reindex} className="btn text-xs">
                <RefreshCw size={14} /> Reindexar 15 notas
              </button>
            ) : null}
          </div>
          {indexStatus ? <p className="mt-2 text-[11px] text-[var(--muted)]">{indexStatus}</p> : null}
        </section>

        <section>
          <h3 className="text-sm font-medium">Copias de seguridad</h3>
          <p className="mt-1 text-[11px] leading-5 text-[var(--muted)]">
            ZIP completo de la bóveda. El cron diario conserva las 7 últimas copias cuando Vercel
            Blob está configurado.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn h-8 text-xs"
              onClick={() => void createBackupNow()}
            >
              Crear backup ahora
            </button>
            <a href={`/api/v1/vaults/${vaultId}/export`} className="btn h-8 text-xs">
              <Download size={13} /> Descargar ZIP
            </a>
            {backupStatus ? (
              <span className="text-[10px] text-[var(--muted)]">{backupStatus}</span>
            ) : null}
          </div>
          <p className="mt-2 text-[10px] leading-4 text-[var(--muted)]">
            {storageProvider === "b2"
              ? "Backups en Backblaze B2 (bucket privado; descarga mediante URL firmada)."
              : storageProvider === "vercel"
                ? "Backups en Vercel Blob."
                : "Sin almacenamiento externo: las copias se guardan en Postgres (máximo 25 MB por ZIP)."}
          </p>
          {backupList.length ? (
            <div className="mt-2 divide-y divide-[var(--border-soft)] rounded-lg border border-[var(--border)]">
              {backupList.map((backup) => (
                <div key={backup.id} className="flex items-center gap-2 px-3 py-2 text-[11px]">
                  <a
                    href={backup.blobUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="min-w-0 flex-1 truncate text-[var(--accent-2)]"
                  >
                    {new Date(backup.createdAt).toLocaleString("es-ES")} · {backup.noteCount} notas ·{" "}
                    {(backup.size / 1024).toFixed(0)} kB
                  </a>
                  <span className="text-[9px] text-[var(--muted)]">{backup.kind}</span>
                  <button
                    type="button"
                    className="btn btn-ghost h-7 w-7 p-0 text-[var(--accent-2)]"
                    onClick={() => void removeBackup(backup.id)}
                    title="Eliminar copia"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        <section>
          <h3 className="text-sm font-medium">Compartir bóveda</h3>
          <p className="mt-1 text-[11px] leading-5 text-[var(--muted)]">
            Enlace público de solo lectura con índice de notas. No permite editar ni ver la papelera.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" className="btn h-8 text-xs" onClick={() => void createVaultShare()}>
              Crear enlace de bóveda
            </button>
            {vaultShares.length ? (
              <span className="text-[10px] text-[var(--muted)]">
                {vaultShares.length} enlace(s) activo(s)
              </span>
            ) : null}
          </div>
          {vaultShares.length ? (
            <div className="mt-2 divide-y divide-[var(--border-soft)] rounded-lg border border-[var(--border)]">
              {vaultShares.map((share) => (
                <div key={share.id} className="flex items-center gap-2 px-3 py-2 text-[11px]">
                  <span className="min-w-0 flex-1 truncate">{share.url}</span>
                  <button
                    type="button"
                    className="btn btn-ghost h-7 text-[10px] text-[var(--accent-2)]"
                    onClick={() => void revokeVaultShare(share.id)}
                  >
                    Revocar
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        {isOwner ? (
          <section>
            <h3 className="text-sm font-medium">Plantillas y nota diaria</h3>
            <p className="mt-1 text-[11px] leading-5 text-[var(--muted)]">
              Variables disponibles: <code>{"{{title}}"}</code>, <code>{"{{date}}"}</code>,{" "}
              <code>{"{{time}}"}</code> y formatos como <code>{"{{date:YYYY-MM-DD}}"}</code>.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <label className="text-[11px] text-[var(--muted)]">
                Carpeta de plantillas
                <input
                  className="input mt-1 h-8 text-xs"
                  value={templatesFolder}
                  onChange={(event) => setTemplatesFolder(event.target.value)}
                  placeholder="Plantillas"
                />
              </label>
              <label className="text-[11px] text-[var(--muted)]">
                Carpeta de notas diarias
                <input
                  className="input mt-1 h-8 text-xs"
                  value={dailyFolder}
                  onChange={(event) => setDailyFolder(event.target.value)}
                  placeholder="Diario"
                />
              </label>
              <label className="text-[11px] text-[var(--muted)]">
                Plantilla diaria
                <input
                  className="input mt-1 h-8 text-xs"
                  value={dailyTemplate}
                  onChange={(event) => setDailyTemplate(event.target.value)}
                  placeholder="Plantillas/Diario.md"
                />
              </label>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <button type="button" className="btn h-8 text-xs" onClick={() => void saveTemplates()}>
                Guardar ajustes
              </button>
              {settingsStatus ? (
                <span className="text-[10px] text-[var(--muted)]">{settingsStatus}</span>
              ) : null}
            </div>
          </section>
        ) : null}

        <section>
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <Tag size={15} /> Etiquetas
          </h3>
          <p className="mt-1 text-[11px] leading-5 text-[var(--muted)]">
            Renombrar también fusiona etiquetas duplicadas. Los cambios se aplican al frontmatter y
            al texto de todas las notas.
          </p>
          <div className="mt-2 divide-y divide-[var(--border-soft)] rounded-lg border border-[var(--border)]">
            {tags.length === 0 ? (
              <p className="p-3 text-xs text-[var(--muted)]">Sin etiquetas todavía.</p>
            ) : (
              tags.map((tag) => (
                <div key={tag.name} className="flex items-center gap-2 px-3 py-2 text-xs">
                  <span className="min-w-0 flex-1 truncate">
                    #{tag.name} <span className="text-[10px] text-[var(--muted)]">{tag.count}</span>
                  </span>
                  <button
                    type="button"
                    className="btn h-7 text-[11px]"
                    onClick={() => void renameTag(tag.name)}
                  >
                    Renombrar
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost h-7 w-7 p-0 text-[var(--accent-2)]"
                    title="Eliminar etiqueta"
                    onClick={() => void deleteTag(tag.name)}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        <section>
          <h3 className="flex items-center gap-2 text-sm font-medium">
            Papelera {trash.length ? <span className="chip">{trash.length}</span> : null}
          </h3>
          <div className="mt-2 divide-y divide-[var(--border-soft)] rounded-lg border border-[var(--border)]">
            {trash.length === 0 ? (
              <p className="p-3 text-xs text-[var(--muted)]">La papelera está vacía.</p>
            ) : (
              trash.map((note) => (
                <div key={note.id} className="flex items-center gap-2 px-3 py-2 text-xs">
                  <span className="flex-1 truncate">{note.path}</span>
                  <button
                    type="button"
                    className="btn h-7 text-[11px]"
                    onClick={() => void restoreNote(note.id)}
                  >
                    Restaurar
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        <section>
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <KeyRound size={15} /> Tokens de API / CLI
          </h3>
          <p className="mt-1 text-[11px] leading-5 text-[var(--muted)]">
            Úsalos con <code className="rounded bg-[var(--panel-2)] px-1">Authorization: Bearer …</code> o
            con el CLI <code className="rounded bg-[var(--panel-2)] px-1">granate login</code>.
          </p>
          <div className="mt-3 flex gap-2">
            <input
              className="input h-9 max-w-[220px] text-xs"
              value={tokenName}
              onChange={(event) => setTokenName(event.target.value)}
              placeholder="Nombre del token"
            />
            <button type="button" className="btn h-9 text-xs" onClick={createToken} disabled={loading}>
              {loading ? <Loader2 size={14} className="animate-spin" /> : null} Crear token
            </button>
          </div>

          {newToken ? (
            <div className="mt-3 rounded-lg border border-[var(--accent)]/40 bg-[var(--accent-soft)] p-3">
              <p className="text-[11px] text-[var(--muted)]">Cópialo ahora: no se volverá a mostrar.</p>
              <div className="mt-2 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded bg-[var(--panel)] px-2 py-1.5 text-[11px]">
                  {newToken}
                </code>
                <button
                  type="button"
                  className="btn h-8 text-xs"
                  onClick={() => navigator.clipboard.writeText(newToken)}
                >
                  <Copy size={13} />
                </button>
              </div>
            </div>
          ) : null}

          <div className="mt-3 divide-y divide-[var(--border-soft)] rounded-lg border border-[var(--border)]">
            {tokens.length === 0 ? (
              <p className="p-3 text-xs text-[var(--muted)]">Sin tokens todavía.</p>
            ) : (
              tokens.map((token) => (
                <div key={token.id} className="flex items-center gap-2 px-3 py-2 text-xs">
                  <span className="flex-1 truncate">{token.name}</span>
                  <span className="text-[10px] text-[var(--muted)]">
                    {new Date(token.createdAt).toLocaleDateString("es-ES")}
                  </span>
                  <button
                    type="button"
                    onClick={() => revoke(token.id)}
                    className="btn btn-ghost h-7 w-7 p-0 text-[var(--accent-2)]"
                    title="Revocar"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] p-4">
          <h3 className="text-sm font-medium">CLI</h3>
          <pre className="mt-2 overflow-x-auto text-[11px] leading-6 text-[var(--text-soft)]">
{`npm i -g ./cli
granate login --url ${typeof window !== "undefined" ? window.location.origin : ""} --token <token>
granate search "sensor de humedad"
granate ask "¿qué decisiones pendientes hay?"`}
          </pre>
        </section>

        <section>
          <button type="button" className="btn text-xs" onClick={logout}>
            Cerrar sesión
          </button>
        </section>
      </div>
    </Modal>
  );
}
