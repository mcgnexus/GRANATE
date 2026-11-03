import type { NextRequest } from "next/server";
import { authenticate, createApiToken, listApiTokens, revokeApiToken } from "@/lib/auth/api";
import { apiError } from "@/lib/http";

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticate(request);
    if (!auth) return Response.json({ error: "No autenticado" }, { status: 401 });
    return Response.json({ tokens: await listApiTokens(auth.user.id) });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticate(request);
    if (!auth) return Response.json({ error: "No autenticado" }, { status: 401 });
    const body = (await request.json().catch(() => ({}))) as { name?: string };
    const token = await createApiToken(auth.user.id, body.name ?? "CLI");
    return Response.json({ token });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await authenticate(request);
    if (!auth) return Response.json({ error: "No autenticado" }, { status: 401 });
    const id = request.nextUrl.searchParams.get("id");
    if (!id) return Response.json({ error: "Falta id" }, { status: 400 });
    await revokeApiToken(auth.user.id, id);
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
