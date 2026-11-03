import type { NextRequest } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { canvases } from "@/lib/db/schema";
import { withVault, apiError } from "@/lib/http";
import { validateCanvas } from "@/lib/canvas";
import { contentHash } from "@/lib/auth/password";

type Ctx = { params: Promise<{ vaultId: string }> };

export async function GET(request: NextRequest, ctx: Ctx) {
  try {
    const { vaultId } = await ctx.params;
    const access = await withVault(request, vaultId);
    if ("response" in access) return access.response;

    const id = request.nextUrl.searchParams.get("id");
    const path = request.nextUrl.searchParams.get("path");

    if (id) {
      const [canvas] = await db
        .select()
        .from(canvases)
        .where(and(eq(canvases.vaultId, vaultId), eq(canvases.id, id)))
        .limit(1);
      if (!canvas) return Response.json({ error: "Canvas no encontrado" }, { status: 404 });
      return Response.json({ canvas });
    }

    if (path) {
      const [canvas] = await db
        .select()
        .from(canvases)
        .where(and(eq(canvases.vaultId, vaultId), sql`lower(${canvases.path}) = ${path.toLowerCase()}`))
        .limit(1);
      if (!canvas) return Response.json({ error: "Canvas no encontrado" }, { status: 404 });
      return Response.json({ canvas });
    }

    const rows = await db
      .select({ id: canvases.id, path: canvases.path, updatedAt: canvases.updatedAt })
      .from(canvases)
      .where(eq(canvases.vaultId, vaultId));
    return Response.json({ canvases: rows });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest, ctx: Ctx) {
  try {
    const { vaultId } = await ctx.params;
    const access = await withVault(request, vaultId, true);
    if ("response" in access) return access.response;

    const body = (await request.json()) as { id?: string; path?: string; data?: unknown };
    const data = validateCanvas(body.data);
    const serialized = JSON.stringify(data);

    if (body.id) {
      const [updated] = await db
        .update(canvases)
        .set({ data, contentHash: contentHash(serialized), updatedAt: new Date() })
        .where(and(eq(canvases.vaultId, vaultId), eq(canvases.id, body.id)))
        .returning();
      if (!updated) return Response.json({ error: "Canvas no encontrado" }, { status: 404 });
      return Response.json({ canvas: updated });
    }

    const path = body.path?.trim();
    if (!path || !path.toLowerCase().endsWith(".canvas")) {
      return Response.json({ error: "Ruta .canvas no válida" }, { status: 400 });
    }

    const existing = await db
      .select({ id: canvases.id })
      .from(canvases)
      .where(and(eq(canvases.vaultId, vaultId), sql`lower(${canvases.path}) = ${path.toLowerCase()}`))
      .limit(1);

    if (existing[0]) {
      const [updated] = await db
        .update(canvases)
        .set({ data, contentHash: contentHash(serialized), updatedAt: new Date() })
        .where(eq(canvases.id, existing[0].id))
        .returning();
      return Response.json({ canvas: updated });
    }

    const [created] = await db
      .insert(canvases)
      .values({ vaultId, path, data, contentHash: contentHash(serialized) })
      .returning();
    return Response.json({ canvas: created });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  try {
    const { vaultId } = await ctx.params;
    const access = await withVault(request, vaultId, true);
    if ("response" in access) return access.response;
    const id = request.nextUrl.searchParams.get("id");
    if (!id) return Response.json({ error: "Falta id" }, { status: 400 });
    await db.delete(canvases).where(and(eq(canvases.vaultId, vaultId), eq(canvases.id, id)));
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
