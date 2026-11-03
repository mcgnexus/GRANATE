import { cookies } from "next/headers";
import { appUrl, config, getEnv } from "@/lib/config";
import { randomToken } from "@/lib/auth/password";

export async function GET() {
  if (!config.googleEnabled) {
    return Response.redirect(`${appUrl()}/login?error=google`);
  }

  const state = randomToken(24);
  const store = await cookies();
  store.set("granate_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });

  const params = new URLSearchParams({
    client_id: getEnv("GOOGLE_CLIENT_ID")!,
    redirect_uri: `${appUrl()}/api/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "offline",
    prompt: "select_account",
  });

  return Response.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}
