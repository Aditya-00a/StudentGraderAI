import { NextResponse } from "next/server";
import {
  isLocalAuthEnabled,
  isProfessorAccessConfigured,
  isProfessorPasswordValid,
  professorSessionCookie,
  shouldUseSecureCookies,
} from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (isLocalAuthEnabled()) {
    return NextResponse.redirect(new URL("/login", request.url), 303);
  }

  const formData = await request.formData();
  const password = String(formData.get("password") ?? "");
  const nextPath = String(formData.get("next") ?? "/");

  const redirectUrl = new URL(
    nextPath.startsWith("/") ? nextPath : "/",
    request.url,
  );

  if (!isProfessorAccessConfigured() || !isProfessorPasswordValid(password)) {
    const loginUrl = new URL("/professor-login", request.url);
    loginUrl.searchParams.set("error", "invalid-password");
    loginUrl.searchParams.set("next", nextPath.startsWith("/") ? nextPath : "/");
    return NextResponse.redirect(loginUrl, 303);
  }

  const response = NextResponse.redirect(redirectUrl, 303);
  response.cookies.set(professorSessionCookie, "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookies(),
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return response;
}
