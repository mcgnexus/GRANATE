import type { NextRequest } from "next/server";
import { withVault, apiError } from "@/lib/http";
import { exportVaultZip } from "@/lib/exporter";
import { slugify } from "@/lib/utils";

type Ctx = { params: Promise<{ vaultId: string }> };

export async function GET(request: NextRequest, ctx: Ctx) {
  try {
    const { vaultId } = await ctx.params;
    const access = await withVault(request, vaultId);
    if ("response" in access) return access.response;

    const bytes = await exportVaultZip(vaultId);
    const name = `${slugify(access.vault.name) || "boveda"}-${new Date()
      .toISOString()
      .slice(0, 10)}.zip`;

    return new Response(bytes as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
