import { NextResponse } from "next/server";
import { forbidden, proxy, sameOrigin } from "@/lib/backend";

export async function POST(req: Request) {
  if (!(await sameOrigin())) return forbidden();
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Invalid JSON body", details: [] } }, { status: 400 });
  }
  return proxy("/contact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
