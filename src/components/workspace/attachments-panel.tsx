"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDialogs } from "@/components/ui/confirm-dialog";
import { Copy, ExternalLink, ImageIcon, Loader2, Paperclip, Trash2, Upload } from "lucide-react";

type Attachment = {
  id: string;
  path: string;
  mime: string;
  size: number;
  url: string;
  storage: "b2" | "vercel" | "postgres";
  createdAt: string;
};

function prettySize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentsPanel({
  vaultId,
  onToast,
}: {
  vaultId: string;
  onToast: (message: string) => void;
}) {
  const [items, setItems] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { confirm, dialogNode } = useDialogs();

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch(
      `/api/v1/vaults/${vaultId}/attachments?list=1`,
    );
    if (response.ok) {
      const data = (await response.json()) as { attachments: Attachment[] };
      setItems(data.attachments ?? []);
    }
    setLoading(false);
  }, [vaultId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial de adjuntos
    void load();
  }, [load]);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      const form = new FormData();
      form.append("file", file);
      form.append("path", `Adjuntos/${file.name}`);
      const response = await fetch(`/api/v1/vaults/${vaultId}/attachments`, {
        method: "POST",
        body: form,
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        onToast(data.error ?? `No se pudo subir ${file.name}`);
      }
    }
    setUploading(false);
    await load();
    onToast("Adjuntos subidos");
  }

  async function remove(item: Attachment) {
    if (
      !(await confirm({
        title: "Eliminar adjunto",
        message: `Se eliminará «${item.path}». Las notas que lo referencien quedarán con el enlace roto.`,
        confirmLabel: "Eliminar",
        danger: true,
      }))
    ) {
      return;
    }
    const response = await fetch(
      `/api/v1/vaults/${vaultId}/attachments?id=${item.id}`,
      { method: "DELETE" },
    );
    if (!response.ok) {
      onToast("No se pudo eliminar el adjunto");
      return;
    }
    await load();
    onToast("Adjunto eliminado");
  }

  async function copy(item: Attachment) {
    await navigator.clipboard.writeText(`![[${item.path}]]`);
    onToast("Enlace copiado: ![[…]]");
  }

  return (
    <div className="space-y-3">
      {dialogNode}
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">
          Adjuntos · {items.length}
        </h3>
        <button
          type="button"
          className="btn h-7 gap-1 px-2 text-[10px]"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
          Subir
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => void upload(event.target.files)}
        />
      </div>

      {loading ? (
        <p className="flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
          <Loader2 size={12} className="animate-spin" /> Cargando…
        </p>
      ) : items.length === 0 ? (
        <p className="flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
          <Paperclip size={12} /> Sin adjuntos. Sube imágenes o archivos y pega su enlace.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {items.map((item) => {
            const isImage = item.mime.startsWith("image/");
            return (
              <div
                key={item.id}
                className="group overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--panel-2)]"
              >
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="grid h-20 place-items-center overflow-hidden bg-[var(--bg)]"
                  title={item.path}
                >
                  {isImage ? (
                    // eslint-disable-next-line @next/next/no-img-element -- adjunto servido desde la API o Blob
                    <img
                      src={item.url}
                      alt={item.path}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <ImageIcon size={22} className="text-[var(--muted)]" />
                  )}
                </a>
                <div className="p-1.5">
                  <div className="truncate text-[10px] text-[var(--text-soft)]" title={item.path}>
                    {item.path.split("/").pop()}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1 text-[9px] text-[var(--muted)]">
                    <span>{prettySize(item.size)}</span>
                    <span className="ml-auto rounded bg-[var(--panel)] px-1">{item.storage}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-0.5">
                    <button
                      type="button"
                      className="btn btn-ghost h-6 flex-1 justify-center px-1 text-[9px]"
                      onClick={() => void copy(item)}
                      title="Copiar enlace para la nota"
                    >
                      <Copy size={10} /> Copiar
                    </button>
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-ghost h-6 w-6 p-0"
                      title="Abrir"
                    >
                      <ExternalLink size={10} />
                    </a>
                    <button
                      type="button"
                      className="btn btn-ghost h-6 w-6 p-0 text-[var(--accent-2)]"
                      onClick={() => void remove(item)}
                      title="Eliminar"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
