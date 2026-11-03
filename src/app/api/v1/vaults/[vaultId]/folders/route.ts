import type { NextRequest } from "next/server";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { folders, notes } from "@/lib/db/schema";
import { withVault, apiError } from "@/lib/http";
import { renameFolder } from "@/lib/notes";
import { normalizeVaultPath } from "@/lib/utils";

type Ctx = { params: Promise<{ vaultId: string }> };

function validateFolderPath(path: string): string {
  const clean = normalizeVaultPath(path);
  if (!clean) throw new Error("La carpeta necesita un nombre");
  const parts = clean.split("/");
  if (parts.some((part) => part === "." || part === ".." || part.length > 120)) {
    throw new Error("Ruta de carpeta no válida");
  }
  if (parts.length > 12) throw new Error("La carpeta tiene demasiados niveles");
  return clean;
}

export async function GET(request: NextRequest, ctx: Ctx) {
  try {
    const { vaultId } = await ctx.params;
    const access = await withVault(request, vaultId);
    if ("response" in access) return access.response;

    const rows = await db
      .select({ id: folders.id, path: folders.path })
      .from(folders)
      .where(eq(folders.vaultId, vaultId))
      .orderBy(folders.path);

    return Response.json({ folders: rows });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest, ctx: Ctx) {
  try {
    const { vaultId } = await ctx.params;
    const access = await withVault(request, vaultId, true);
    if ("response" in access) return access.response;

    const body = (await request.json()) as { path?: string };
    const path = validateFolderPath(body.path ?? "");

    const parts = path.split("/");
    for (let index = 1; index <= parts.length; index++) {
      const folderPath = parts.slice(0, index).join("/");
      await db
        .insert(folders)
        .values({ vaultId, path: folderPath })
        .onConflictDoNothing();
    }

    return Response.json({ ok: true, path });
  } catch (error) {
    if (error instanceof Error && !("status" in error)) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return apiError(error);
  }
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  try {
    const { vaultId } = await ctx.params;
    const access = await withVault(request, vaultId, true);
    if ("response" in access) return access.response;

    const body = (await request.json().catch(() => ({}))) as {
      path?: string;
      newPath?: string;
    };
    const from = validateFolderPath(body.path ?? "");
    const to = validateFolderPath(body.newPath ?? "");

    const result = await renameFolder({
      vaultId,
      userId: access.user.id,
      from,
      to,
    });
    return Response.json({ ok: true, ...result, path: to });
  } catch (error) {
    if (error instanceof Error && !("status" in error)) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return apiError(error);
  }
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  try {
    const { vaultId } = await ctx.params;
    const access = await withVault(request, vaultId, true);
    if ("response" in access) return access.response;

    const path = validateFolderPath(request.nextUrl.searchParams.get("path") ?? "");
    const prefix = `${path.toLowerCase()}/`;

    const noteCount = await db
      .select({ id: notes.id })
      .from(notes)
      .where(
        and(
          eq(notes.vaultId, vaultId),
          isNull(notes.deletedAt),
          sql`lower(${notes.path}) like ${`${prefix}%`}`,
        ),
      )
      .limit(1);

    if (noteCount[0]) {
      return Response.json(
        { error: "La carpeta no está vacía. Mueve o borra sus notas primero." },
        { status: 409 },
      );
    }

    const subfolder = await db
      .select({ id: folders.id })
      .from(folders)
      .where(
        and(
          eq(folders.vaultId, vaultId),
          sql`lower(${folders.path}) like ${`${prefix}%`}`,
        ),
      )
      .limit(1);

    if (subfolder[0]) {
      return Response.json(
        { error: "La carpeta contiene subcarpetas. Elimínalas primero." },
        { status: 409 },
      );
    }

    await db
      .delete(folders)
      .where(
        and(
          eq(folders.vaultId, vaultId),
          sql`lower(${folders.path}) = ${path.toLowerCase()}`,
        ),
      );

    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && !("status" in error)) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return apiError(error);
  }
}
