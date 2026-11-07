import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { users } from "@/lib/db/schema";
import { consumeVerificationToken } from "@/lib/auth/email";
import { appUrl } from "@/lib/config";

export async function GET(request: Request) {
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  if (!checkRateLimit("verify:" + ip, 10, 60_000)) {
    return Response.json({ error: "Demasiados intentos." }, { status: 429 });
  }
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (!token) return Response.redirect(`${appUrl()}/login?error=token`);

  const record = await consumeVerificationToken(token);
  if (!record) return Response.redirect(`${appUrl()}/login?error=token`);

  await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, record.userId));
  return Response.redirect(`${appUrl()}/login?verified=1`);
}
