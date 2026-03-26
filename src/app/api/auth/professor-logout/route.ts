import { NextResponse } from "next/server";
import {
  appSessionCookie,
  clearAppSession,
  professorSessionCookie,
  shouldUseSecureCookies,
} from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  clearAppSession(request.headers.get("cookie"));
  const response = NextResponse.redirect(new URL("/login", request.url), 303);
  response.cookies.set(appSessionCookie, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookies(),
    path: "/",
    maxAge: 0,
  });
  response.cookies.set(professorSessionCookie, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookies(),
    path: "/",
    maxAge: 0,
  });
  return response;
}
