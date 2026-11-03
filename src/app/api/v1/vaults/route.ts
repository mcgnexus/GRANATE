import type { NextRequest } from "next/server";
import { asc, eq, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { vaultMembers, vaults } from "@/lib/db/schema";
import { authenticate } from "@/lib/auth/api";
import { slugify } from "@/lib/utils";
import { apiError } from "@/lib/http";

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticate(request);
    if (!auth) return Response.json({ error: "No autenticado" }, { status: 401 });

    const rows = await db
      .select({
        id: vaults.id,
        name: vaults.name,
        slug: vaults.slug,
        createdAt: vaults.createdAt,
        role: sql<string>`case when ${vaults.ownerId} = ${auth.user.id} then 'owner' else coalesce(${vaultMembers.role}, 'viewer') end`,
      })
      .from(vaults)
      .leftJoin(vaultMembers, eq(vaultMembers.vaultId, vaults.id))
      .where(or(eq(vaults.ownerId, auth.user.id), eq(vaultMembers.userId, auth.user.id)))
      .orderBy(asc(vaults.createdAt));

    return Response.json({ vaults: rows });
  } catch (error) {
    return apiError(error);
  }
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticate(request);
    if (!auth) return Response.json({ error: "No autenticado" }, { status: 401 });

    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "Nombre no válido" }, { status: 400 });

    const baseSlug = slugify(parsed.data.name) || "boveda";
    let slug = baseSlug;
    for (let i = 2; i < 100; i++) {
      const exists = await db
        .select({ id: vaults.id })
        .from(vaults)
        .where(sql`${vaults.ownerId} = ${auth.user.id} and ${vaults.slug} = ${slug}`)
        .limit(1);
      if (!exists[0]) break;
      slug = `${baseSlug}-${i}`;
    }

    const [vault] = await db
      .insert(vaults)
      .values({
        ownerId: auth.user.id,
        name: parsed.data.name,
        slug,
        settings: parsed.data.description ? { description: parsed.data.description } : {},
      })
      .returning();

    await db
      .insert(vaultMembers)
      .values({ vaultId: vault.id, userId: auth.user.id, role: "owner" })
      .onConflictDoNothing();

    return Response.json({ vault });
  } catch (error) {
    return apiError(error);
  }
}
