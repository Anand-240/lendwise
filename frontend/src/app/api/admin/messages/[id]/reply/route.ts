import { forbidden, proxy, sameOrigin } from "@/lib/backend";

export async function POST(req: Request, ctx: RouteContext<"/api/admin/messages/[id]/reply">) {
  if (!(await sameOrigin())) return forbidden();
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return new Response(null, { status: 404 });
  return proxy(`/admin/messages/${id}/reply`, {
    method: "POST",
    auth: true,
    headers: { "Content-Type": "application/json" },
    body: await req.text(),
  });
}
