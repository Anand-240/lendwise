import { NextResponse } from "next/server";
import { ADMIN_COOKIE, backendFetch, BackendUnavailable, relay, unavailable } from "@/lib/backend";

export async function GET(req: Request) {
  const qs = new URL(req.url).searchParams.toString();
  try {
    const res = await backendFetch(`/admin/applications/export.csv${qs ? `?${qs}` : ""}`, { auth: true });
    if (!res.ok) {
      const out = await relay(res);
      if (res.status === 401) out.cookies.delete(ADMIN_COOKIE);
      return out;
    }
    return new NextResponse(res.body, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": res.headers.get("content-disposition") ?? 'attachment; filename="lendwise-applications.csv"',
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof BackendUnavailable) return unavailable();
    throw e;
  }
}
