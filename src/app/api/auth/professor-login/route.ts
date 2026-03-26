import { NextResponse } from "next/server";
import {
  isLocalAuthEnabled,
  isProfessorAccessConfigured,
  isProfessorPasswordValid,
  professorSessionCookie,
  shouldUseSecureCookies,
} from "@/lib/auth";
import { buildRequestUrl } from "@/lib/request-url";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (isLocalAuthEnabled()) {
    return NextResponse.redirect(buildRequestUrl(request, "/login"), 303);
  }

  const formData = await request.formData();
  const password = String(formData.get("password") ?? "");
  const nextPath = String(formData.get("next") ?? "/");

  const redirectUrl = buildRequestUrl(request, nextPath.startsWith("/") ? nextPath : "/");

  if (!isProfessorAccessConfigured() || !isProfessorPasswordValid(password)) {
    const loginUrl = buildRequestUrl(request, "/professor-login");
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
