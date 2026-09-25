import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { appCookieName, forbidden, proxy, sameOrigin } from "@/lib/backend";

// Applicant answers an officer's request for more information. Authorised by the private
// cookie from submission, or by the email used in a status lookup.
export async function POST(req: Request, ctx: RouteContext<"/api/applications/[id]/reply">) {
  if (!(await sameOrigin())) return forbidden();
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body.message !== "string") {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Please write a reply.", details: [] } }, { status: 400 });
  }
  const token = (await cookies()).get(appCookieName(id))?.value;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["X-Access-Token"] = token;
  return proxy(`/applications/${encodeURIComponent(id)}/reply`, {
    method: "POST",
    headers,
    body: JSON.stringify({ message: body.message, email: typeof body.email === "string" ? body.email : null }),
  });
}
