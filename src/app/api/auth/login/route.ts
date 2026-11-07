import { z } from "zod";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { config } from "@/lib/config";
import { checkRateLimit } from "@/lib/rate-limit";

const schema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(128),
});

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  if (!checkRateLimit("login:" + ip, 10, 60_000)) {
    return Response.json({ error: "Demasiados intentos." }, { status: 429 });
  }
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: "Email o contraseña no válidos." }, { status: 400 });
    }

    const email = parsed.data.email.toLowerCase();
    const rows = await db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = ${email}`)
      .limit(1);
    const user = rows[0];

    if (!user || !verifyPassword(parsed.data.password, user.passwordHash)) {
      return Response.json({ error: "Email o contraseña incorrectos." }, { status: 401 });
    }

    if (!config.autoVerifyEmails && !user.emailVerifiedAt) {
      return Response.json(
        { error: "Verifica tu email antes de entrar. Revisa tu bandeja de entrada." },
        { status: 403 },
      );
    }

    await createSession(user.id, {
      userAgent: request.headers.get("user-agent"),
      ip: request.headers.get("x-forwarded-for"),
    });

    return Response.json({ user: { id: user.id, email: user.email, name: user.name } });
  } catch (error) {
    console.error("[GRANATE] login", error);
    return Response.json({ error: "No se pudo iniciar sesión." }, { status: 500 });
  }
}
