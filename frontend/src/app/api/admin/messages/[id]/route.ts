import { forbidden, proxy, sameOrigin } from "@/lib/backend";

export async function PATCH(req: Request, ctx: RouteContext<"/api/admin/messages/[id]">) {
  if (!(await sameOrigin())) return forbidden();
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return new Response(null, { status: 404 });
  return proxy(`/admin/messages/${id}`, {
    method: "PATCH",
    auth: true,
    headers: { "Content-Type": "application/json" },
    body: await req.text(),
  });
}
