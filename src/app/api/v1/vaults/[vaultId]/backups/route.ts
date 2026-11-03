import type { NextRequest } from "next/server";
import { withVault, apiError } from "@/lib/http";
import {
  createBackup,
  deleteBackup,
  hasBlobStorage,
  listBackups,
} from "@/lib/backups";

type Ctx = { params: Promise<{ vaultId: string }> };

export async function GET(request: NextRequest, ctx: Ctx) {
  try {
    const { vaultId } = await ctx.params;
    const access = await withVault(request, vaultId);
    if ("response" in access) return access.response;
    return Response.json({
      backups: await listBackups(vaultId),
      blob: hasBlobStorage(),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest, ctx: Ctx) {
  try {
    const { vaultId } = await ctx.params;
    const access = await withVault(request, vaultId, true);
    if ("response" in access) return access.response;
    const backup = await createBackup({
      vaultId,
      vaultName: access.vault.name,
      kind: "manual",
    });
    return Response.json({ backup });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  try {
    const { vaultId } = await ctx.params;
    const access = await withVault(request, vaultId, true);
    if ("response" in access) return access.response;
    const id = request.nextUrl.searchParams.get("id");
    if (!id) return Response.json({ error: "Falta id" }, { status: 400 });
    await deleteBackup(vaultId, id);
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
