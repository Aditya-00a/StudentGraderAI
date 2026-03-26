import { NextResponse } from "next/server";
import {
  authenticateLocalUser,
  appSessionCookie,
  createAppSession,
  isLocalAuthEnabled,
  shouldUseSecureCookies,
} from "@/lib/auth";
import { buildRequestUrl } from "@/lib/request-url";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const nextPath = String(formData.get("next") ?? "/");

  if (!isLocalAuthEnabled()) {
    return NextResponse.redirect(buildRequestUrl(request, "/login?error=not-ready"), 303);
  }

  const user = authenticateLocalUser(email, password);
  if (!user) {
    const loginUrl = buildRequestUrl(request, "/login");
    loginUrl.searchParams.set("error", "invalid-credentials");
    loginUrl.searchParams.set("next", nextPath.startsWith("/") ? nextPath : "/");
    return NextResponse.redirect(loginUrl, 303);
  }

  const redirectTarget = nextPath.startsWith("/")
    ? nextPath
    : user.role === "student"
      ? "/submit"
      : "/";

  const session = createAppSession(user.id);
  const response = NextResponse.redirect(buildRequestUrl(request, redirectTarget), 303);
  response.cookies.set(appSessionCookie, session.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookies(),
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
  return response;
}
