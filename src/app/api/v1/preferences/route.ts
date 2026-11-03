import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { userPreferences } from "@/lib/db/schema";
import { withUser, apiError } from "@/lib/http";
import { DEFAULT_PALETTE, isPaletteId } from "@/lib/palettes";

export async function GET(request: NextRequest) {
  try {
    const access = await withUser(request);
    if ("response" in access) return access.response;
    const [row] = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, access.user.id))
      .limit(1);
    return Response.json({
      preferences: {
        palette: row?.palette ?? DEFAULT_PALETTE,
        theme: row?.theme ?? "dark",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const access = await withUser(request);
    if ("response" in access) return access.response;
    const body = (await request.json().catch(() => ({}))) as {
      palette?: string;
      theme?: string;
    };

    const palette =
      typeof body.palette === "string" && isPaletteId(body.palette)
        ? body.palette
        : undefined;
    const theme =
      body.theme === "light" || body.theme === "dark" ? body.theme : undefined;
    if (!palette && !theme) {
      return Response.json({ error: "Nada que guardar" }, { status: 400 });
    }

    const [existing] = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, access.user.id))
      .limit(1);

    if (existing) {
      await db
        .update(userPreferences)
        .set({
          ...(palette ? { palette } : {}),
          ...(theme ? { theme } : {}),
          updatedAt: new Date(),
        })
        .where(eq(userPreferences.userId, access.user.id));
    } else {
      await db.insert(userPreferences).values({
        userId: access.user.id,
        palette: palette ?? DEFAULT_PALETTE,
        theme: theme ?? "dark",
      });
    }

    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
