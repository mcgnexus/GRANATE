import type { NextRequest } from "next/server";
import { withVault, apiError } from "@/lib/http";
import { trackNoteOpen } from "@/lib/notes";

type Ctx = { params: Promise<{ vaultId: string; noteId: string }> };

export async function POST(request: NextRequest, ctx: Ctx) {
  try {
    const { vaultId, noteId } = await ctx.params;
    const access = await withVault(request, vaultId);
    if ("response" in access) return access.response;
    await trackNoteOpen(access.user.id, vaultId, noteId);
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
