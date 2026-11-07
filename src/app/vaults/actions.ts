"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { vaultMembers, vaults } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { slugify } from "@/lib/utils";

export async function createVaultAction(formData: FormData) {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const baseSlug = slugify(name) || "boveda";
  let slug = baseSlug;
  for (let i = 2; i < 100; i++) {
    const existing = await db
      .select({ id: vaults.id })
      .from(vaults)
      .where(and(eq(vaults.ownerId, user.id), eq(vaults.slug, slug)))
      .limit(1);
    if (!existing[0]) break;
    slug = `${baseSlug}-${i}`;
  }

  const [vault] = await db
    .insert(vaults)
    .values({ ownerId: user.id, name: name.slice(0, 80), slug })
    .returning();

  await db
    .insert(vaultMembers)
    .values({ vaultId: vault.id, userId: user.id, role: "owner" })
    .onConflictDoNothing();

  revalidatePath("/vaults");
  redirect(`/vaults/${vault.id}`);
}

export async function deleteVaultAction(formData: FormData) {
  const user = await requireUser();
  const vaultId = String(formData.get("vaultId") ?? "");
  const confirmName = String(formData.get("confirmName") ?? "").trim();
  if (!vaultId) return;

  const [vault] = await db
    .select({ id: vaults.id, name: vaults.name })
    .from(vaults)
    .where(
      and(
        eq(vaults.id, vaultId),
        eq(vaults.ownerId, user.id),
        isNull(vaults.deletedAt),
      ),
    )
    .limit(1);
  if (!vault) return;
  if (confirmName !== vault.name) return;

  // Papelera: borrado logico con 30 dias de gracia; el cron purga despues.
  await db
    .update(vaults)
    .set({ deletedAt: new Date() })
    .where(and(eq(vaults.id, vaultId), isNull(vaults.deletedAt)));
  revalidatePath("/vaults");
}

export async function restoreVaultAction(formData: FormData) {
  const user = await requireUser();
  const vaultId = String(formData.get("vaultId") ?? "");
  if (!vaultId) return;

  await db
    .update(vaults)
    .set({ deletedAt: null })
    .where(and(eq(vaults.id, vaultId), eq(vaults.ownerId, user.id)));
  revalidatePath("/vaults");
}
