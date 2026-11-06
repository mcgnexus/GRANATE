import type { NextRequest } from "next/server";
import { ApiError, authenticate, requireVault } from "@/lib/auth/api";
import type { SessionUser } from "@/lib/auth/session";
import type { VaultAccess } from "@/lib/auth/api";

export async function withUser(
  request: NextRequest,
): Promise<{ user: SessionUser } | { response: Response }> {
  const auth = await authenticate(request);
  if (!auth) {
    return { response: Response.json({ error: "No autenticado" }, { status: 401 }) };
  }
  return { user: auth.user };
}

export async function withVault(
  request: NextRequest,
  vaultId: string,
  write = false,
): Promise<{ user: SessionUser; vault: VaultAccess } | { response: Response }> {
  const auth = await authenticate(request);
  if (!auth) {
    return { response: Response.json({ error: "No autenticado" }, { status: 401 }) };
  }
  try {
    const vault = await requireVault(auth.user.id, vaultId, write);
    return { user: auth.user, vault };
  } catch (error) {
    if (error instanceof ApiError) {
      return { response: Response.json({ error: error.message }, { status: error.status }) };
    }
    throw error;
  }
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new ApiError("JSON inválido", 400);
  }
}

export function apiError(error: unknown) {
  if (error instanceof ApiError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error(error);
  const message =
    process.env.NODE_ENV === "production"
      ? "Error interno"
      : error instanceof Error
        ? error.message
        : "Error interno";
  return Response.json({ error: message }, { status: 500 });
}
