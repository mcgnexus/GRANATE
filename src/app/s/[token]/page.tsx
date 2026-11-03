import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { notes, shareLinks, vaults } from "@/lib/db/schema";
import { ShareView } from "@/components/share/share-view";

type Props = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ path?: string }>;
};

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Nota compartida · GRANATE",
};

export default async function SharedPage({ params, searchParams }: Props) {
  const { token } = await params;
  const { path } = await searchParams;

  const [share] = await db
    .select({
      id: shareLinks.id,
      vaultId: shareLinks.vaultId,
      noteId: shareLinks.noteId,
      expiresAt: shareLinks.expiresAt,
      revokedAt: shareLinks.revokedAt,
      vaultName: vaults.name,
    })
    .from(shareLinks)
    .innerJoin(vaults, eq(shareLinks.vaultId, vaults.id))
    .where(eq(shareLinks.token, token))
    .limit(1);

  if (
    !share ||
    share.revokedAt ||
    // eslint-disable-next-line react-hooks/purity -- el enlace caduca en tiempo real; se evalúa por petición en el servidor
    (share.expiresAt && share.expiresAt.getTime() < Date.now())
  ) {
    notFound();
  }

  if (share.noteId) {
    const [note] = await db
      .select({ path: notes.path, content: notes.content, title: notes.title })
      .from(notes)
      .where(and(eq(notes.id, share.noteId), isNull(notes.deletedAt)))
      .limit(1);
    if (!note) notFound();
    return (
      <SharedShell vaultName={share.vaultName} title={note.path}>
        <ShareView content={note.content} vaultId={share.vaultId} token={token} />
      </SharedShell>
    );
  }

  const allNotes = await db
    .select({ id: notes.id, path: notes.path, title: notes.title })
    .from(notes)
    .where(and(eq(notes.vaultId, share.vaultId), isNull(notes.deletedAt)))
    .orderBy(asc(notes.path));

  const selected = path
    ? allNotes.find((note) => note.path.toLowerCase() === path.toLowerCase())
    : null;

  if (path && !selected) notFound();

  if (selected) {
    const [note] = await db
      .select({ content: notes.content })
      .from(notes)
      .where(and(eq(notes.id, selected.id), isNull(notes.deletedAt)))
      .limit(1);
    return (
      <SharedShell
        vaultName={share.vaultName}
        title={selected.path}
        notes={allNotes}
        currentPath={selected.path}
        token={token}
      >
        <ShareView content={note?.content ?? ""} vaultId={share.vaultId} token={token} />
      </SharedShell>
    );
  }

  return (
    <SharedShell vaultName={share.vaultName} title="Índice">
      <div className="mx-auto max-w-3xl p-6">
        <p className="mb-4 text-sm text-[var(--muted)]">
          Bóveda compartida en modo lectura. Elige una nota:
        </p>
        <div className="divide-y divide-[var(--border-soft)] rounded-lg border border-[var(--border)]">
          {allNotes.map((note) => (
            <Link
              key={note.id}
              href={`/s/${token}?path=${encodeURIComponent(note.path)}`}
              className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm text-[var(--text-soft)] hover:bg-[var(--panel-2)]"
            >
              <span className="truncate">{note.path}</span>
              <span className="text-[10px] text-[var(--muted)]">
                {note.title}
              </span>
            </Link>
          ))}
          {allNotes.length === 0 ? (
            <p className="p-4 text-sm text-[var(--muted)]">La bóveda está vacía.</p>
          ) : null}
        </div>
      </div>
    </SharedShell>
  );
}

function SharedShell({
  vaultName,
  title,
  notes,
  currentPath,
  token,
  children,
}: {
  vaultName: string;
  title: string;
  notes?: Array<{ id: string; path: string; title: string }>;
  currentPath?: string;
  token?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-[var(--bg)] text-[var(--text)]">
      <header className="sticky top-0 z-20 flex h-12 items-center gap-2 border-b border-[var(--border)] bg-[var(--panel)] px-3 text-xs">
        <span className="grid h-7 w-7 place-items-center rounded-md bg-[var(--accent)] text-[11px] font-bold text-white">
          G
        </span>
        <span className="min-w-0 truncate font-medium">{vaultName}</span>
        <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[9px] uppercase tracking-wide text-[var(--muted)]">
          solo lectura
        </span>
        <span className="ml-auto max-w-[40%] truncate text-[10px] text-[var(--muted)]">{title}</span>
      </header>
      <div className="mx-auto flex max-w-[1200px]">
        {notes && token ? (
          <aside className="sticky top-12 hidden h-[calc(100dvh-3rem)] w-64 shrink-0 overflow-y-auto border-r border-[var(--border)] bg-[var(--panel)] p-2 md:block">
            <Link
              href={`/s/${token}`}
              className="mb-2 block rounded-md px-2 py-1.5 text-[11px] text-[var(--muted)] hover:bg-[var(--panel-2)]"
            >
              ← Índice
            </Link>
            {notes.map((note) => (
              <Link
                key={note.id}
                href={`/s/${token}?path=${encodeURIComponent(note.path)}`}
                className={`block truncate rounded-md px-2 py-1.5 text-[11px] ${
                  currentPath === note.path
                    ? "bg-[var(--accent-soft)] text-[var(--text)]"
                    : "text-[var(--text-soft)] hover:bg-[var(--panel-2)]"
                }`}
              >
                {note.path}
              </Link>
            ))}
          </aside>
        ) : null}
        <main className="min-w-0 flex-1">{children}</main>
      </div>
      <footer className="border-t border-[var(--border)] p-3 text-center text-[10px] text-[var(--muted)]">
        Compartido con GRANATE · sin permisos de edición
      </footer>
    </div>
  );
}
