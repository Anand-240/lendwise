import { NextResponse } from "next/server";
import { forbidden, proxy, sameOrigin } from "@/lib/backend";

export async function POST(req: Request) {
  if (!(await sameOrigin())) return forbidden();
  const text = await req.text();
  try {
    JSON.parse(text);
  } catch {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Send the application as JSON.", details: [{ field: null, message: "Send the application as JSON." }] } },
      { status: 422 },
    );
  }
  return proxy("/screen", { method: "POST", headers: { "Content-Type": "application/json" }, body: text });
}
