import { cookies } from "next/headers";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { oauthAccounts, users } from "@/lib/db/schema";
import { createSession } from "@/lib/auth/session";
import { appUrl, config, getEnv } from "@/lib/config";

type GoogleProfile = {
  sub: string;
  email: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const store = await cookies();
  const expectedState = store.get("granate_oauth_state")?.value;
  store.delete("granate_oauth_state");

  if (!code || !state || state !== expectedState) {
    return Response.redirect(`${appUrl()}/login?error=google_state`);
  }

  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: getEnv("GOOGLE_CLIENT_ID")!,
        client_secret: getEnv("GOOGLE_CLIENT_SECRET")!,
        redirect_uri: `${appUrl()}/api/auth/google/callback`,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) throw new Error(await tokenResponse.text());
    const tokens = (await tokenResponse.json()) as { access_token: string };

    const profileResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!profileResponse.ok) throw new Error(await profileResponse.text());
    const profile = (await profileResponse.json()) as GoogleProfile;
    if (!profile.email) throw new Error("Google no devolvió email");

    const email = profile.email.toLowerCase();
    const existing = await db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = ${email}`)
      .limit(1);

    let userId = existing[0]?.id;

    if (existing[0] && !profile.email_verified) {
      return Response.redirect(`${appUrl()}/login?error=google_unverified`);
    }

    if (!userId) {
      if (!config.openRegistration) {
        return Response.redirect(`${appUrl()}/login?error=closed`);
      }
      const [created] = await db
        .insert(users)
        .values({
          email,
          name: profile.name?.trim() || email.split("@")[0],
          image: profile.picture ?? null,
          emailVerifiedAt: profile.email_verified ? new Date() : null,
        })
        .returning();
      userId = created.id;
    }

    const linked = await db
      .select({ id: oauthAccounts.id })
      .from(oauthAccounts)
      .where(
        sql`${oauthAccounts.provider} = 'google' and ${oauthAccounts.providerAccountId} = ${profile.sub}`,
      )
      .limit(1);

    if (!linked[0]) {
      await db
        .insert(oauthAccounts)
        .values({ userId, provider: "google", providerAccountId: profile.sub })
        .onConflictDoNothing();
    }

    await createSession(userId, {
      userAgent: request.headers.get("user-agent"),
      ip: request.headers.get("x-forwarded-for"),
    });

    return Response.redirect(`${appUrl()}/vaults`);
  } catch (error) {
    console.error("[GRANATE] Google OAuth", error);
    return Response.redirect(`${appUrl()}/login?error=google`);
  }
}
