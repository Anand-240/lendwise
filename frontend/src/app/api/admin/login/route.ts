import { NextResponse } from "next/server";
import { ADMIN_COOKIE, backendFetch, BackendUnavailable, forbidden, relay, sameOrigin, secureCookies, unavailable } from "@/lib/backend";

export async function POST(req: Request) {
  if (!(await sameOrigin())) return forbidden();
  const body = await req.json().catch(() => ({}));
  try {
    const res = await backendFetch("/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: body?.email ?? "", password: body?.password ?? "" }),
    });
    if (!res.ok) return relay(res);
    const { access_token, expires_in } = await res.json();
    const out = NextResponse.json({ ok: true });
    out.cookies.set(ADMIN_COOKIE, access_token, {
      httpOnly: true,
      sameSite: "strict",
      secure: secureCookies,
      path: "/",
      maxAge: expires_in,
    });
    return out;
  } catch (e) {
    if (e instanceof BackendUnavailable) return unavailable();
    throw e;
  }
}
