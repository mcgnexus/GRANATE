import { z } from "zod";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { users } from "@/lib/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { sendVerificationEmail } from "@/lib/auth/email";
import { config } from "@/lib/config";

const schema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email(),
  password: z
    .string()
    .min(8)
    .max(128)
    .regex(/[A-Za-z]/)
    .regex(/[0-9]/),
});

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  if (!checkRateLimit("register:" + ip, 5, 60_000)) {
    return Response.json({ error: "Demasiados intentos." }, { status: 429 });
  }
  try {
    if (!config.openRegistration) {
      return Response.json({ error: "El registro está cerrado. Pide una invitación." }, { status: 403 });
    }

    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Revisa los datos: nombre (2+), email válido y contraseña de 8+ con letra y número." },
        { status: 400 },
      );
    }

    const email = parsed.data.email.toLowerCase();
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.email}) = ${email}`)
      .limit(1);

    if (existing[0]) {
      return Response.json({ error: "Ya existe una cuenta con ese email." }, { status: 409 });
    }

    const [user] = await db
      .insert(users)
      .values({
        name: parsed.data.name,
        email,
        passwordHash: hashPassword(parsed.data.password),
        emailVerifiedAt: config.autoVerifyEmails ? new Date() : null,
      })
      .returning();

    if (!config.autoVerifyEmails) {
      await sendVerificationEmail(user.id, user.email);
    }

    await createSession(user.id, {
      userAgent: request.headers.get("user-agent"),
      ip: request.headers.get("x-forwarded-for"),
    });

    return Response.json({ user: { id: user.id, email: user.email, name: user.name } });
  } catch (error) {
    console.error("[GRANATE] register", error);
    return Response.json({ error: "No se pudo crear la cuenta." }, { status: 500 });
  }
}
