import type { NextRequest } from "next/server";
import { withVault, apiError } from "@/lib/http";
import { importVaultZip } from "@/lib/import-export";

type Ctx = { params: Promise<{ vaultId: string }> };

export async function POST(request: NextRequest, ctx: Ctx) {
  try {
    const { vaultId } = await ctx.params;
    const access = await withVault(request, vaultId, true);
    if ("response" in access) return access.response;

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "Adjunta un ZIP de bóveda" }, { status: 400 });
    }
    if (file.size > 20 * 1024 * 1024) {
      return Response.json({ error: "El ZIP supera 20 MB. Divídelo por carpetas." }, { status: 413 });
    }

    const buffer = await file.arrayBuffer();
    const report = await importVaultZip(vaultId, access.user.id, buffer);
    return Response.json({ ok: true, report });
  } catch (error) {
    return apiError(error);
  }
}
