import { forbidden, proxy, sameOrigin } from "@/lib/backend";

export async function POST(req: Request) {
  if (!(await sameOrigin())) return forbidden();
  const body = await req.json().catch(() => ({}));
  return proxy("/otp/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: body?.phone ?? "" }) });
}
