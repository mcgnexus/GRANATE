import type { NextRequest } from "next/server";
import { withVault, apiError } from "@/lib/http";
import { listTags } from "@/lib/notes";

type Ctx = { params: Promise<{ vaultId: string }> };

export async function GET(request: NextRequest, ctx: Ctx) {
  try {
    const { vaultId } = await ctx.params;
    const access = await withVault(request, vaultId);
    if ("response" in access) return access.response;
    return Response.json({ tags: await listTags(vaultId) });
  } catch (error) {
    return apiError(error);
  }
}
