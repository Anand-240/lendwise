import { proxy } from "@/lib/backend";

export async function GET(req: Request) {
  const qs = new URL(req.url).searchParams.toString();
  return proxy(`/admin/stats${qs ? `?${qs}` : ""}`, { auth: true });
}
