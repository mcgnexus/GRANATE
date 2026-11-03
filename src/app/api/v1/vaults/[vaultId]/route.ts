import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { vaults } from "@/lib/db/schema";
import { withVault, apiError } from "@/lib/http";
import { deleteVaultStorage } from "@/lib/storage-cleanup";

type Ctx = { params: Promise<{ vaultId: string }> };

export async function GET(request: NextRequest, ctx: Ctx) {
  const { vaultId } = await ctx.params;
  const access = await withVault(request, vaultId);
  if ("response" in access) return access.response;
  return Response.json({ vault: access.vault });
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  try {
    const { vaultId } = await ctx.params;
    const access = await withVault(request, vaultId, true);
    if ("response" in access) return access.response;
    if (access.vault.role !== "owner") {
      return Response.json({ error: "Solo el propietario puede editar la bóveda" }, { status: 403 });
    }

    const body = (await request.json()) as { name?: string; settings?: Record<string, unknown> };
    await db
      .update(vaults)
      .set({
        ...(body.name ? { name: body.name.slice(0, 80) } : {}),
        ...(body.settings ? { settings: body.settings } : {}),
        updatedAt: new Date(),
      })
      .where(eq(vaults.id, vaultId));

    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  try {
    const { vaultId } = await ctx.params;
    const access = await withVault(request, vaultId, true);
    if ("response" in access) return access.response;
    if (access.vault.role !== "owner") {
      return Response.json({ error: "Solo el propietario puede borrar la bóveda" }, { status: 403 });
    }
    await deleteVaultStorage(vaultId);
    await db.delete(vaults).where(eq(vaults.id, vaultId));
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
