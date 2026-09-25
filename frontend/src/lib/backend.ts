import "server-only";
import { cookies, headers } from "next/headers";
import { connection, NextResponse } from "next/server";
import type { ApiError, Health, Metadata } from "./types";

const BACKEND = (process.env.BACKEND_API_URL || "http://localhost:8000").replace(/\/$/, "");
export const ADMIN_COOKIE = "lw_admin";
export const appCookieName = (id: string) => `lw_app_${id.toUpperCase().replace(/[^A-Z0-9-]/g, "")}`;

export class BackendUnavailable extends Error {}

type Init = RequestInit & { auth?: boolean; forward?: boolean; next?: { revalidate?: number | false } };

/** Server-side fetch to FastAPI. Forwards the client IP (for rate limiting) and,
 *  when `auth` is set, the officer JWT from the httpOnly cookie. */
export async function backendFetch(path: string, init: Init = {}): Promise<Response> {
  const { auth, forward = true, ...rest } = init;
  const h = new Headers(rest.headers);
  h.set("Accept", "application/json");
  if (forward) {
    try {
      const incoming = await headers();
      // Platforms (Vercel, most load balancers) set x-real-ip / overwrite x-forwarded-for with the
      // real client address. Self-hosted without a proxy, the header is client-controlled, so the
      // backend also enforces a global submission cap (RATE_LIMIT_GLOBAL_PER_MINUTE).
      const ip = incoming.get("x-real-ip") || incoming.get("x-forwarded-for")?.split(",")[0]?.trim();
      if (ip) h.set("X-Forwarded-For", ip);
      const rid = incoming.get("x-request-id");
      if (rid) h.set("X-Request-ID", rid);
    } catch {
      /* outside a request scope (build time) */
    }
  }
  if (auth) {
    const token = (await cookies()).get(ADMIN_COOKIE)?.value;
    if (token) h.set("Authorization", `Bearer ${token}`);
  }
  try {
    return await fetch(`${BACKEND}/api/v1${path}`, {
      cache: rest.next ? undefined : "no-store",
      ...rest,
      headers: h,
      signal: rest.signal ?? AbortSignal.timeout(20_000),
    });
  } catch (e) {
    throw new BackendUnavailable(e instanceof Error ? e.message : "Backend unreachable");
  }
}

export function unavailable(): NextResponse<ApiError> {
  return NextResponse.json(
    {
      error: {
        code: "SERVICE_UNAVAILABLE",
        message: "Service temporarily unavailable. Please try again in a few minutes.",
        details: [],
      },
    },
    { status: 503 },
  );
}

/** Pass a backend response straight through (status + JSON body). */
export async function relay(res: Response): Promise<NextResponse> {
  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { error: { code: "BAD_GATEWAY", message: "Unexpected response from the decision service.", details: [] } };
    return NextResponse.json(body, { status: 502 });
  }
  const out = NextResponse.json(body, { status: res.status });
  const rid = res.headers.get("x-request-id");
  if (rid) out.headers.set("X-Request-ID", rid);
  const retry = res.headers.get("retry-after");
  if (retry) out.headers.set("Retry-After", retry);
  return out;
}

export async function proxy(path: string, init: Init = {}): Promise<NextResponse> {
  try {
    const out = await relay(await backendFetch(path, init));
    // A rejected officer token (expired, forged, or signed with a rotated JWT_SECRET) must be
    // cleared, otherwise the /admin guard keeps bouncing between login and dashboard.
    if (init.auth && out.status === 401) out.cookies.delete(ADMIN_COOKIE);
    return out;
  } catch (e) {
    if (e instanceof BackendUnavailable) return unavailable();
    throw e;
  }
}

/** Reject cross-site mutating requests (defence in depth on top of SameSite cookies). */
export async function sameOrigin(): Promise<boolean> {
  const h = await headers();
  const origin = h.get("origin");
  if (!origin) return true; // same-origin fetches from older browsers / server calls
  const host = h.get("x-forwarded-host") || h.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function forbidden(): NextResponse<ApiError> {
  return NextResponse.json({ error: { code: "FORBIDDEN", message: "Cross-site request blocked.", details: [] } }, { status: 403 });
}

/** Cached metadata for server components; null if the backend is down. */
export async function getMetadata(): Promise<Metadata | null> {
  try {
    const res = await backendFetch("/metadata", { next: { revalidate: 300 }, forward: false });
    return res.ok ? ((await res.json()) as Metadata) : null;
  } catch {
    return null;
  }
}

/** For ISR pages: if the backend is down, render dynamically instead of caching the
 *  "unavailable" state (at build time the route falls back to dynamic rendering). */
export async function getMetadataUncachedOnFailure(): Promise<Metadata | null> {
  const md = await getMetadata();
  if (!md) await connection();
  return md;
}

export async function getHealth(): Promise<Health | null> {
  try {
    const res = await backendFetch("/health", { forward: false, signal: AbortSignal.timeout(4000) });
    return res.ok ? ((await res.json()) as Health) : null;
  } catch {
    return null;
  }
}

export const secureCookies = process.env.NODE_ENV === "production" && !process.env.INSECURE_COOKIES;
