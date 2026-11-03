import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Database, FileText, FolderOpen, Plus, Trash2 } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { vaults, vaultMembers } from "@/lib/db/schema";
import { eq, or, sql } from "drizzle-orm";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { LogoutButton } from "@/components/vaults/logout-button";
import { createVaultAction, deleteVaultAction } from "./actions";

export const metadata: Metadata = { title: "Mis bóvedas" };

export default async function VaultsPage() {
  const user = await requireUser();

  const rows = await db
    .select({
      id: vaults.id,
      name: vaults.name,
      slug: vaults.slug,
      createdAt: vaults.createdAt,
      ownerId: vaults.ownerId,
      role: sql<string>`case when ${vaults.ownerId} = ${user.id} then 'owner' else coalesce(${vaultMembers.role}, 'viewer') end`,
      noteCount: sql<number>`(select count(*)::int from notes n where n.vault_id = ${vaults.id} and n.deleted_at is null)`,
    })
    .from(vaults)
    .leftJoin(vaultMembers, eq(vaultMembers.vaultId, vaults.id))
    .where(or(eq(vaults.ownerId, user.id), eq(vaultMembers.userId, user.id)))
    .orderBy(vaults.createdAt);

  return (
    <main className="bg-grain min-h-dvh">
      <header className="border-b border-[var(--border)] bg-[var(--panel)]/80">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-5 py-3">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--accent)] text-xs font-bold text-white">
            G
          </span>
          <div>
            <div className="text-sm font-medium leading-tight">GRANATE</div>
            <div className="text-[10px] leading-tight text-[var(--muted)]">{user.email}</div>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <LogoutButton />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-5 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl">Tus bóvedas</h1>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Hola, {user.name}. Elige una bóveda o crea una nueva.
            </p>
          </div>
          <form action={createVaultAction} className="flex gap-2">
            <input
              name="name"
              placeholder="Nombre de la bóveda"
              required
              maxLength={80}
              className="input h-9 w-48 text-xs"
            />
            <button type="submit" className="btn btn-primary h-9 text-xs">
              <Plus size={14} /> Crear
            </button>
          </form>
        </div>

        {rows.length === 0 ? (
          <div className="panel mt-8 p-10 text-center">
            <FolderOpen size={36} className="mx-auto text-[var(--accent-2)]" />
            <h2 className="mt-4 font-display text-2xl">Aún no tienes bóvedas</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--muted)]">
              Crea una arriba. Después podrás importar tu ZIP de Obsidian, crear notas o
              preguntarle al LLM sobre tus documentos.
            </p>
          </div>
        ) : (
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {rows.map((vault) => (
              <div key={vault.id} className="panel group relative overflow-hidden p-5">
                <div className="absolute right-0 top-0 h-24 w-24 rounded-full bg-[var(--accent-soft)] blur-2xl" />
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate font-display text-xl">{vault.name}</h2>
                    <div className="mt-1 flex items-center gap-2 text-[10px] text-[var(--muted)]">
                      <span className="chip">{vault.role}</span>
                      <span>{vault.noteCount} notas</span>
                      <span>·</span>
                      <span>{new Date(vault.createdAt).toLocaleDateString("es-ES")}</span>
                    </div>
                  </div>
                  <Database size={16} className="shrink-0 text-[var(--gold)]" />
                </div>

                <div className="mt-5 flex items-center gap-2">
                  <Link href={`/vaults/${vault.id}`} className="btn btn-primary h-8 flex-1 text-xs">
                    Abrir <ArrowRight size={13} />
                  </Link>
                  {vault.role === "owner" ? (
                    <form action={deleteVaultAction}>
                      <input type="hidden" name="vaultId" value={vault.id} />
                      <button
                        type="submit"
                        className="btn h-8 w-8 p-0 text-[var(--muted)] hover:text-[var(--accent-2)]"
                        title="Borrar bóveda"
                      >
                        <Trash2 size={13} />
                      </button>
                    </form>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-10 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4 text-xs text-[var(--muted)]">
          <FileText size={15} className="text-[var(--accent-2)]" />
          ¿Vienes de Obsidian? Abre una bóveda y usa <span className="chip">Importar</span> con un
          ZIP que incluya tus notas y adjuntos.
        </div>
      </div>
    </main>
  );
}
