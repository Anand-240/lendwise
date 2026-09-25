import { proxy } from "@/lib/backend";

export async function GET(req: Request) {
  const qs = new URL(req.url).searchParams.toString();
  return proxy(`/admin/messages${qs ? `?${qs}` : ""}`, { auth: true });
}
