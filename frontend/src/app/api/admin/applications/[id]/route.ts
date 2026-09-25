import { NextResponse } from "next/server";
import { ADMIN_COOKIE, backendFetch, BackendUnavailable, forbidden, proxy, relay, sameOrigin, unavailable } from "@/lib/backend";

export async function GET(_req: Request, ctx: RouteContext<"/api/admin/applications/[id]">) {
  const { id } = await ctx.params;
  return proxy(`/admin/applications/${encodeURIComponent(id)}`, { auth: true });
}

export async function PATCH(req: Request, ctx: RouteContext<"/api/admin/applications/[id]">) {
  if (!(await sameOrigin())) return forbidden();
  const { id } = await ctx.params;
  const body = await req.text();
  return proxy(`/admin/applications/${encodeURIComponent(id)}`, {
    method: "PATCH",
    auth: true,
    headers: { "Content-Type": "application/json" },
    body,
  });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/admin/applications/[id]">) {
  if (!(await sameOrigin())) return forbidden();
  const { id } = await ctx.params;
  try {
    const res = await backendFetch(`/admin/applications/${encodeURIComponent(id)}`, { method: "DELETE", auth: true });
    if (res.status === 204) return new NextResponse(null, { status: 204 });
    const out = await relay(res);
    if (res.status === 401) out.cookies.delete(ADMIN_COOKIE);
    return out;
  } catch (e) {
    if (e instanceof BackendUnavailable) return unavailable();
    throw e;
  }
}
