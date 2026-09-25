import { NextResponse, type NextRequest } from "next/server";

// Coarse gate for officer pages: requires an unexpired admin cookie. The JWT itself is
// verified by FastAPI on every data call; this only avoids rendering the shell for guests.
function tokenLooksValid(token: string | undefined): boolean {
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.exp === "number" && payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const authed = tokenLooksValid(request.cookies.get("lw_admin")?.value);

  if (pathname === "/admin/login") {
    return authed ? NextResponse.redirect(new URL("/admin", request.url)) : NextResponse.next();
  }
  if (!authed) {
    const url = new URL("/admin/login", request.url);
    url.searchParams.set("next", pathname);
    const res = NextResponse.redirect(url);
    res.cookies.delete("lw_admin");
    return res;
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
