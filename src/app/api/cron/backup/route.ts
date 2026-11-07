import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { vaults } from "@/lib/db/schema";
import { isNull, lt } from "drizzle-orm";
import { createBackup, pruneBackups } from "@/lib/backups";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const header = request.headers.get("authorization");
    if (header !== `Bearer ${secret}`) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }
  }

  // Purga definitiva de bóvedas en papelera hace más de 30 días.
  await db
    .delete(vaults)
    .where(lt(vaults.deletedAt, new Date(Date.now() - 30 * 86_400_000)));

  const rows = await db
    .select({ id: vaults.id, name: vaults.name })
    .from(vaults)
    .where(isNull(vaults.deletedAt));
  const results: Array<{ vaultId: string; ok: boolean; error?: string }> = [];

  for (const vault of rows) {
    try {
      await createBackup({ vaultId: vault.id, vaultName: vault.name, kind: "cron" });
      await pruneBackups(vault.id, 7);
      results.push({ vaultId: vault.id, ok: true });
    } catch (error) {
      results.push({
        vaultId: vault.id,
        ok: false,
        error: error instanceof Error ? error.message : "Error",
      });
    }
  }

  return Response.json({ created: results.filter((item) => item.ok).length, results });
}
