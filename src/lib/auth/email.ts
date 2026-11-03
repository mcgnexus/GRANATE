import { appUrl, config, getEnv } from "@/lib/config";
import { randomToken, sha256 } from "./password";
import { db } from "@/lib/db";
import { verificationTokens } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function sendVerificationEmail(userId: string, email: string) {
  if (config.autoVerifyEmails) return null;

  const raw = randomToken(24);
  await db.insert(verificationTokens).values({
    userId,
    tokenHash: sha256(raw),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });

  const link = `${appUrl()}/api/auth/verify?token=${raw}`;
  const resendKey = getEnv("RESEND_API_KEY");
  if (!resendKey) {
    console.warn(`[GRANATE] Sin RESEND_API_KEY. Enlace de verificación: ${link}`);
    return link;
  }

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: getEnv("EMAIL_FROM") ?? "GRANATE <no-reply@granate.local>",
      to: [email],
      subject: "Verifica tu cuenta de GRANATE",
      html: `<p>Hola,</p><p>Confirma tu cuenta de GRANATE con este enlace:</p><p><a href="${link}">${link}</a></p><p>Caduca en 24 horas.</p>`,
    }),
  }).catch((error) => console.error("[GRANATE] Resend error", error));

  return link;
}

export async function consumeVerificationToken(raw: string) {
  const rows = await db
    .select()
    .from(verificationTokens)
    .where(eq(verificationTokens.tokenHash, sha256(raw)))
    .limit(1);
  const token = rows[0];
  if (!token || token.usedAt || token.expiresAt < new Date()) return null;
  await db
    .update(verificationTokens)
    .set({ usedAt: new Date() })
    .where(eq(verificationTokens.id, token.id));
  return token;
}
