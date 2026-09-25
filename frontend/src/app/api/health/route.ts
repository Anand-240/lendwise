import { proxy } from "@/lib/backend";

export async function GET() {
  return proxy("/health", { forward: false, signal: AbortSignal.timeout(5000) });
}
