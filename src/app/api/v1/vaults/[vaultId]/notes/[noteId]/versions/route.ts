import type { NextRequest } from "next/server";
import { withVault, apiError } from "@/lib/http";
import { getVersion, getVersions, restoreVersion } from "@/lib/notes";

type Ctx = { params: Promise<{ vaultId: string; noteId: string }> };

export async function GET(request: NextRequest, ctx: Ctx) {
  try {
    const { vaultId, noteId } = await ctx.params;
    const access = await withVault(request, vaultId);
    if ("response" in access) return access.response;

    const versionId = request.nextUrl.searchParams.get("versionId");
    if (versionId) {
      const version = await getVersion(vaultId, noteId, versionId);
      if (!version) return Response.json({ error: "Versión no encontrada" }, { status: 404 });
      return Response.json({ version });
    }
    return Response.json({ versions: await getVersions(vaultId, noteId) });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest, ctx: Ctx) {
  try {
    const { vaultId, noteId } = await ctx.params;
    const access = await withVault(request, vaultId, true);
    if ("response" in access) return access.response;

    const body = (await request.json()) as { versionId?: string };
    if (!body.versionId) return Response.json({ error: "Falta versionId" }, { status: 400 });

    await restoreVersion(vaultId, noteId, body.versionId, access.user.id);
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
