import type { NextRequest } from "next/server";
import { withVault, apiError } from "@/lib/http";
import { setNotePinned } from "@/lib/notes";

type Ctx = { params: Promise<{ vaultId: string; noteId: string }> };

export async function POST(request: NextRequest, ctx: Ctx) {
  try {
    const { vaultId, noteId } = await ctx.params;
    const access = await withVault(request, vaultId, true);
    if ("response" in access) return access.response;

    const body = (await request.json().catch(() => ({}))) as { pinned?: boolean };
    await setNotePinned(vaultId, noteId, Boolean(body.pinned));
    return Response.json({ ok: true, pinned: Boolean(body.pinned) });
  } catch (error) {
    return apiError(error);
  }
}
