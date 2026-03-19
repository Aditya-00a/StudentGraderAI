import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isProfessorAccessConfigured, professorSessionCookie } from "@/lib/auth";

export function middleware(request: NextRequest) {
  if (!isProfessorAccessConfigured()) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;
  const protectedPath =
    pathname === "/" ||
    pathname.startsWith("/submissions") ||
    pathname.startsWith("/api/assignments") ||
    pathname.startsWith("/api/rubric-suggestions");

  if (!protectedPath) {
    return NextResponse.next();
  }

  const hasSession = request.cookies.get(professorSessionCookie)?.value === "1";
  if (hasSession) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/professor-login", request.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/", "/submissions/:path*", "/api/assignments/:path*", "/api/rubric-suggestions/:path*"],
};
