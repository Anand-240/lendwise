import { NextResponse } from "next/server";
import { ADMIN_COOKIE, forbidden, sameOrigin } from "@/lib/backend";

export async function POST() {
  if (!(await sameOrigin())) return forbidden();
  const out = NextResponse.json({ ok: true });
  out.cookies.delete(ADMIN_COOKIE);
  return out;
}
