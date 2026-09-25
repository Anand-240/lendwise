import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { appCookieName, proxy } from "@/lib/backend";

export async function GET(_req: Request, ctx: RouteContext<"/api/applications/[id]">) {
  const { id } = await ctx.params;
  const token = (await cookies()).get(appCookieName(id))?.value;
  if (!token) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "No application matches those details.", details: [] } }, { status: 404 });
  }
  return proxy(`/applications/${encodeURIComponent(id)}`, { headers: { "X-Access-Token": token } });
}
