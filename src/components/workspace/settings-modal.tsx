"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Download, KeyRound, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { ThemeToggle } from "@/components/ui/theme-toggle";

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
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  vaultId: string;
  vaultName: string;
  canWrite: boolean;
  onChanged: () => void;
}) {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [newToken, setNewToken] = useState("");
  const [tokenName, setTokenName] = useState("CLI");
  const [loading, setLoading] = useState(false);
  const [indexStatus, setIndexStatus] = useState("");
  const [trash, setTrash] = useState<Array<{ id: string; path: string }>>([]);
  const router = useRouter();

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
  }, [open, loadTrash]);

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
