import type { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { backups } from "@/lib/db/schema";
import { withVault, apiError } from "@/lib/http";

type Ctx = { params: Promise<{ vaultId: string }> };

export async function GET(request: NextRequest, ctx: Ctx) {
  try {
    const { vaultId } = await ctx.params;
    const access = await withVault(request, vaultId);
    if ("response" in access) return access.response;

    const id = request.nextUrl.searchParams.get("id");
    if (!id) return Response.json({ error: "Falta id" }, { status: 400 });

    const [row] = await db
      .select()
      .from(backups)
      .where(and(eq(backups.vaultId, vaultId), eq(backups.id, id)))
      .limit(1);
    if (!row) return Response.json({ error: "Backup no encontrado" }, { status: 404 });

    if (row.data) {
      const bytes = Buffer.from(row.data, "base64");
      return new Response(bytes as unknown as BodyInit, {
        headers: {
          "Content-Type": "application/zip",
          "Content-Length": String(bytes.byteLength),
          "Content-Disposition": `attachment; filename="${row.path.split("/").pop() ?? "backup.zip"}"`,
          "Cache-Control": "no-store",
        },
      });
    }

    if (row.blobUrl) {
      return Response.redirect(row.blobUrl, 307);
    }
    return Response.json({ error: "Backup no encontrado" }, { status: 404 });
  } catch (error) {
    return apiError(error);
  }
}
