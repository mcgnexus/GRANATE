import type { NextRequest } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { notes } from "@/lib/db/schema";
import { withVault, apiError } from "@/lib/http";
import { parseFrontmatter } from "@/lib/markdown/frontmatter";

type Ctx = { params: Promise<{ vaultId: string }> };

export async function GET(request: NextRequest, ctx: Ctx) {
  try {
    const { vaultId } = await ctx.params;
    const access = await withVault(request, vaultId);
    if ("response" in access) return access.response;

    const rows = await db
      .select({ id: notes.id, path: notes.path, content: notes.content })
      .from(notes)
      .where(and(eq(notes.vaultId, vaultId), isNull(notes.deletedAt)));

    const map = new Map<string, { key: string; count: number; notes: Array<{ id: string; path: string }> }>();
    for (const row of rows) {
      const parsed = parseFrontmatter(row.content);
      for (const key of Object.keys(parsed.frontmatter ?? {})) {
        if (!map.has(key)) map.set(key, { key, count: 0, notes: [] });
        const entry = map.get(key)!;
        entry.count += 1;
        entry.notes.push({ id: row.id, path: row.path });
      }
    }
    return Response.json({ properties: Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key)) });
  } catch (error) {
    return apiError(error);
  }
}
