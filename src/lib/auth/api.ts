import type { NextRequest } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { apiTokens, vaultMembers, vaults } from "@/lib/db/schema";
import { randomToken, sha256 } from "@/lib/auth/password";
import { findUserByToken, getSessionUser, type SessionUser } from "@/lib/auth/session";

export type ApiAuth =
  | { kind: "session"; user: SessionUser }
  | { kind: "token"; user: SessionUser };

export async function authenticate(req: NextRequest): Promise<ApiAuth | null> {
  const header = req.headers.get("authorization");
  if (header?.startsWith("Bearer ")) {
    const user = await findUserByToken(header.slice(7).trim());
    return user ? { kind: "token", user } : null;
  }
  const user = await getSessionUser();
  return user ? { kind: "session", user } : null;
}

export async function createApiToken(userId: string, name: string) {
  const raw = `granate_${randomToken(32)}`;
  const [row] = await db
    .insert(apiTokens)
    .values({ userId, name: name.slice(0, 80) || "CLI", tokenHash: sha256(raw) })
    .returning({ id: apiTokens.id, createdAt: apiTokens.createdAt });
  return { ...row, token: raw };
}

export async function listApiTokens(userId: string) {
  return db
    .select({
      id: apiTokens.id,
      name: apiTokens.name,
      lastUsedAt: apiTokens.lastUsedAt,
      revokedAt: apiTokens.revokedAt,
      createdAt: apiTokens.createdAt,
    })
    .from(apiTokens)
    .where(eq(apiTokens.userId, userId))
    .orderBy(sql`created_at desc`);
}

export async function revokeApiToken(userId: string, id: string) {
  await db
    .update(apiTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiTokens.id, id), eq(apiTokens.userId, userId)));
}

export type VaultAccess = {
  id: string;
  name: string;
  slug: string;
  role: "owner" | "editor" | "viewer";
  settings: Record<string, unknown>;
};

export async function getVaultAccess(
  userId: string,
  vaultId: string,
): Promise<VaultAccess | null> {
  const rows = await db
    .select({
      id: vaults.id,
      name: vaults.name,
      slug: vaults.slug,
      settings: vaults.settings,
      role: vaultMembers.role,
      ownerId: vaults.ownerId,
    })
    .from(vaults)
    .leftJoin(
      vaultMembers,
      and(eq(vaultMembers.vaultId, vaults.id), eq(vaultMembers.userId, userId)),
    )
    .where(eq(vaults.id, vaultId))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  const role = row.ownerId === userId ? "owner" : row.role;
  if (!role) return null;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    role: role as VaultAccess["role"],
    settings: row.settings ?? {},
  };
}

export async function requireVault(userId: string, vaultId: string, write = false) {
  const vault = await getVaultAccess(userId, vaultId);
  if (!vault) throw new ApiError("Bóveda no encontrada", 404);
  if (write && vault.role === "viewer") throw new ApiError("Sin permisos de escritura", 403);
  return vault;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function jsonError(error: unknown) {
  if (error instanceof ApiError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error(error);
  const message = error instanceof Error ? error.message : "Error interno";
  return Response.json({ error: message }, { status: 500 });
}

/** Ensures the user can access a vault. Used by server actions. */
export async function assertVaultMember(userId: string, vaultId: string) {
  const rows = await db
    .select({ role: vaultMembers.role })
    .from(vaultMembers)
    .where(and(eq(vaultMembers.vaultId, vaultId), eq(vaultMembers.userId, userId)))
    .limit(1);
  return rows[0]?.role ?? null;
}

export async function countVaults(userId: string) {
  const rows = await db
    .select({ id: vaults.id })
    .from(vaults)
    .leftJoin(vaultMembers, eq(vaultMembers.vaultId, vaults.id))
    .where(sql`${vaults.ownerId} = ${userId} or ${vaultMembers.userId} = ${userId}`);
  return rows.length;
}

export function isUniqueViolation(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "23505",
  );
}
