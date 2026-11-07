import type { NextRequest } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { notes } from "@/lib/db/schema";
import { withVault, apiError } from "@/lib/http";

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

    const tasks: Array<{ noteId: string; path: string; text: string; done: boolean; line: number }> = [];
    for (const row of rows) {
      const lines = row.content.split("\n");
      lines.forEach((line, index) => {
        const match = /^\s*- \[([ xX])\] (.*)$/.exec(line);
        if (match) {
          tasks.push({
            noteId: row.id,
            path: row.path,
            text: match[2].trim(),
            done: match[1].toLowerCase() === "x",
            line: index + 1,
          });
        }
      });
    }
    return Response.json({ tasks });
  } catch (error) {
    return apiError(error);
  }
}
