"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, ExternalLink, Loader2, Share2, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";

type Share = {
  id: string;
  token: string;
  noteId: string | null;
  notePath: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  url: string;
};

export function ShareModal({
  open,
  onClose,
  vaultId,
  noteId,
  notePath,
  onToast,
}: {
  open: boolean;
  onClose: () => void;
  vaultId: string;
  noteId: string;
  notePath: string;
  onToast: (message: string) => void;
}) {
  const [shares, setShares] = useState<Share[]>([]);
  const [expires, setExpires] = useState("0");
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState<Share | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch(
      `/api/v1/vaults/${vaultId}/shares?noteId=${encodeURIComponent(noteId)}`,
    );
    if (response.ok) {
      const data = (await response.json()) as { shares: Share[] };
      setShares(data.shares ?? []);
    }
    setLoading(false);
  }, [vaultId, noteId]);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reinicia el enlace al abrir
    setCreated(null);
    void load();
  }, [open, load]);

  async function create() {
    const response = await fetch(`/api/v1/vaults/${vaultId}/shares`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ noteId, expiresInDays: Number(expires) }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      share?: Share;
      error?: string;
    };
    if (!response.ok || !data.share) {
      onToast(data.error ?? "No se pudo crear el enlace");
      return;
    }
    setCreated(data.share);
    await navigator.clipboard.writeText(data.share.url).catch(() => undefined);
    onToast("Enlace copiado al portapapeles");
    await load();
  }

  async function revoke(id: string) {
    await fetch(`/api/v1/vaults/${vaultId}/shares?id=${id}`, { method: "DELETE" });
    await load();
    onToast("Enlace revocado");
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Compartir nota"
      subtitle={notePath}
    >
      <div className="space-y-4 p-5 text-xs">
        <p className="leading-5 text-[var(--muted)]">
          Cualquiera con el enlace podrá leer esta nota sin iniciar sesión. No se muestran los
          backlinks ni el resto de la bóveda.
        </p>

        <div className="flex flex-wrap items-end gap-2">
          <label className="text-[11px] text-[var(--muted)]">
            Caducidad
            <select
              className="input mt-1 h-9 text-xs"
              value={expires}
              onChange={(event) => setExpires(event.target.value)}
            >
              <option value="0">Sin caducidad</option>
              <option value="7">7 días</option>
              <option value="30">30 días</option>
              <option value="365">1 año</option>
            </select>
          </label>
          <button type="button" className="btn btn-primary h-9 gap-1.5" onClick={() => void create()}>
            <Share2 size={14} /> Crear enlace
          </button>
        </div>

        {created ? (
          <div className="rounded-lg border border-[var(--accent)]/40 bg-[var(--accent-soft)] p-3">
            <p className="flex items-center gap-1 text-[10px] text-[var(--muted)]">
              <Check size={11} className="text-[var(--green)]" /> Enlace creado y copiado
            </p>
            <div className="mt-2 flex items-center gap-1.5">
              <input className="input h-8 min-w-0 flex-1 text-[11px]" readOnly value={created.url} />
              <button
                type="button"
                className="btn h-8 w-8 p-0"
                onClick={() => void navigator.clipboard.writeText(created.url)}
                title="Copiar"
              >
                <Copy size={13} />
              </button>
              <a
                href={created.url}
                target="_blank"
                rel="noreferrer"
                className="btn h-8 w-8 p-0"
                title="Abrir"
              >
                <ExternalLink size={13} />
              </a>
            </div>
          </div>
        ) : null}

        <div>
          <div className="mb-1 text-[10px] uppercase tracking-wide text-[var(--muted)]">
            Enlaces de esta nota
          </div>
          <div className="divide-y divide-[var(--border-soft)] rounded-lg border border-[var(--border)]">
            {loading ? (
              <p className="flex items-center gap-1.5 p-3 text-[11px] text-[var(--muted)]">
                <Loader2 size={12} className="animate-spin" /> Cargando…
              </p>
            ) : shares.length === 0 ? (
              <p className="p-3 text-[11px] text-[var(--muted)]">Todavía no hay enlaces.</p>
            ) : (
              shares.map((share) => (
                <div key={share.id} className="flex items-center gap-2 px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--text-soft)]">
                    {share.url}
                  </span>
                  <span className="text-[9px] text-[var(--muted)]">
                    {share.expiresAt
                      ? new Date(share.expiresAt).toLocaleDateString("es-ES")
                      : "sin caducidad"}
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost h-7 w-7 p-0 text-[var(--accent-2)]"
                    onClick={() => void revoke(share.id)}
                    title="Revocar enlace"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
