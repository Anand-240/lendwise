import { NextResponse } from "next/server";
import { appCookieName, backendFetch, BackendUnavailable, forbidden, relay, sameOrigin, secureCookies, unavailable } from "@/lib/backend";

export async function POST(req: Request) {
  if (!(await sameOrigin())) return forbidden();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Invalid JSON body", details: [] } }, { status: 400 });
  }
  try {
    const res = await backendFetch("/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.status !== 201) return relay(res);
    const data = await res.json();
    const { access_token, ...result } = data;
    const out = NextResponse.json(result, { status: 201 });
    // Private token lets this browser reopen its own decision page without re-entering the email.
    out.cookies.set(appCookieName(result.application_id), access_token, {
      httpOnly: true,
      sameSite: "lax",
      secure: secureCookies,
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return out;
  } catch (e) {
    if (e instanceof BackendUnavailable) return unavailable();
    throw e;
  }
}
