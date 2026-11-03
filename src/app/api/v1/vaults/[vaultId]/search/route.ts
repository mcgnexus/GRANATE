import type { NextRequest } from "next/server";
import { withVault, apiError } from "@/lib/http";
import { searchNotes } from "@/lib/search";

type Ctx = { params: Promise<{ vaultId: string }> };

export async function GET(request: NextRequest, ctx: Ctx) {
  try {
    const { vaultId } = await ctx.params;
    const access = await withVault(request, vaultId);
    if ("response" in access) return access.response;

    const params = request.nextUrl.searchParams;
    const query = params.get("q") ?? "";
    const hits = await searchNotes(vaultId, query, {
      limit: Number(params.get("limit") ?? 20),
      tag: params.get("tag") ?? undefined,
      folder: params.get("folder") ?? undefined,
      semantic: params.get("semantic") !== "0",
    });

    return Response.json({ hits });
  } catch (error) {
    return apiError(error);
  }
}
