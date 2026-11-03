import type { NextRequest } from "next/server";
import { z } from "zod";
import { withVault, apiError } from "@/lib/http";
import { batchNotes } from "@/lib/notes";

type Ctx = { params: Promise<{ vaultId: string }> };

const schema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(250),
  action: z.enum(["move", "tag", "untag", "delete", "pin", "unpin"]),
  folder: z.string().max(500).optional(),
  tag: z.string().max(120).optional(),
});

export async function POST(request: NextRequest, ctx: Ctx) {
  try {
    const { vaultId } = await ctx.params;
    const access = await withVault(request, vaultId, true);
    if ("response" in access) return access.response;

    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: "Datos no válidos" }, { status: 400 });
    }
    if (parsed.data.action === "tag" || parsed.data.action === "untag") {
      if (!parsed.data.tag?.trim()) {
        return Response.json({ error: "Falta la etiqueta" }, { status: 400 });
      }
    }

    const result = await batchNotes({
      vaultId,
      userId: access.user.id,
      ...parsed.data,
    });
    return Response.json(result);
  } catch (error) {
    return apiError(error);
  }
}
