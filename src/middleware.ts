import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE = "animal_husbandry_session";
const LEGACY_SESSION_COOKIE = "medcare_session";

const publicPaths = ["/login"];
const apiPrefix = "/api";

const staticExtensions = [".svg", ".ico", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".css", ".js"];
function isStaticAsset(pathname: string) {
  return staticExtensions.some((ext) => pathname.endsWith(ext));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith(apiPrefix) || isStaticAsset(pathname)) {
    return NextResponse.next();
  }
  const hasSession =
    request.cookies.has(SESSION_COOKIE) || request.cookies.has(LEGACY_SESSION_COOKIE);
  if (publicPaths.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    if (hasSession) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }
  if (!hasSession) {
    const login = new URL("/login", request.url);
    login.searchParams.set("from", pathname);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
