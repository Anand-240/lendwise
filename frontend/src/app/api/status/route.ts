import { NextResponse } from "next/server";
import { proxy } from "@/lib/backend";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = (url.searchParams.get("id") || "").trim().toUpperCase();
  const email = (url.searchParams.get("email") || "").trim();
  if (!/^LW-\d{4}-\d{6}$/.test(id) || !email) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Enter a valid application ID (e.g. LW-2026-000123) and email.", details: [] } },
      { status: 422 },
    );
  }
  return proxy(`/applications/${encodeURIComponent(id)}/status?email=${encodeURIComponent(email)}`);
}
