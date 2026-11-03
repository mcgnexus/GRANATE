import type { NextRequest } from "next/server";
import { z } from "zod";
import { withVault, apiError } from "@/lib/http";
import { deleteTag, listTags, renameTag } from "@/lib/notes";

type Ctx = { params: Promise<{ vaultId: string }> };

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("rename"),
    from: z.string().min(1).max(120),
    to: z.string().min(1).max(120),
  }),
  z.object({
    action: z.literal("delete"),
    name: z.string().min(1).max(120),
  }),
]);

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

export async function POST(request: NextRequest, ctx: Ctx) {
  try {
    const { vaultId } = await ctx.params;
    const access = await withVault(request, vaultId, true);
    if ("response" in access) return access.response;

    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: "Datos no válidos" }, { status: 400 });
    }

    const result =
      parsed.data.action === "rename"
        ? await renameTag({
            vaultId,
            userId: access.user.id,
            from: parsed.data.from,
            to: parsed.data.to,
          })
        : await deleteTag({
            vaultId,
            userId: access.user.id,
            name: parsed.data.name,
          });

    return Response.json({ ok: true, ...result });
  } catch (error) {
    return apiError(error);
  }
}
