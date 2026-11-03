"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
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
  if (!vaultId) return;

  const owned = await db
    .select({ id: vaults.id })
    .from(vaults)
    .where(and(eq(vaults.id, vaultId), eq(vaults.ownerId, user.id)))
    .limit(1);
  if (!owned[0]) return;

  await db.delete(vaults).where(eq(vaults.id, vaultId));
  revalidatePath("/vaults");
}
