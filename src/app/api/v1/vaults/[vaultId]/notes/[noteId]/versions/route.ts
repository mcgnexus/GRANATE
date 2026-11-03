import type { NextRequest } from "next/server";
import { withVault, apiError } from "@/lib/http";
import { getVersions, restoreVersion } from "@/lib/notes";

type Ctx = { params: Promise<{ vaultId: string; noteId: string }> };

export async function GET(request: NextRequest, ctx: Ctx) {
  try {
    const { vaultId, noteId } = await ctx.params;
    const access = await withVault(request, vaultId);
    if ("response" in access) return access.response;
    return Response.json({ versions: await getVersions(noteId) });
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

    await restoreVersion(noteId, body.versionId, access.user.id);
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
