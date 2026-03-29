import { NextResponse } from "next/server";
import { z } from "zod";
import {
  appSessionCookie,
  createAppSession,
  getCurrentUserFromCookieHeader,
  hashPassword,
  isLocalAuthEnabled,
  shouldUseSecureCookies,
} from "@/lib/auth";
import { getUserByEmail, updateUserActivationByEmail } from "@/lib/local-auth-db";
import { buildRequestUrl } from "@/lib/request-url";

export const runtime = "nodejs";

const createPasswordSchema = z
  .object({
    email: z.string().email().trim().max(160),
    firstName: z.string().trim().min(2, "Enter your first name.").max(80),
    lastName: z.string().trim().min(2, "Enter your last name.").max(80),
    password: z
      .string()
      .min(10, "Use at least 10 characters.")
      .max(128)
      .regex(/[A-Za-z]/, "Include at least one letter.")
      .regex(/[0-9]/, "Include at least one number."),
    confirmPassword: z.string().max(128),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords must match.",
    path: ["confirmPassword"],
  });

export async function POST(request: Request) {
  if (!isLocalAuthEnabled()) {
    const url = buildRequestUrl(request, "/activate");
    url.searchParams.set("error", "not-ready");
    return NextResponse.redirect(url, 303);
  }

  if (getCurrentUserFromCookieHeader(request.headers.get("cookie"))) {
    const currentUser = getCurrentUserFromCookieHeader(request.headers.get("cookie"));
    return NextResponse.redirect(
      buildRequestUrl(request, currentUser?.role === "student" ? "/submit" : "/"),
      303,
    );
  }

  const formData = await request.formData();
  const parsed = createPasswordSchema.safeParse({
    email: String(formData.get("email") ?? ""),
    firstName: String(formData.get("firstName") ?? ""),
    lastName: String(formData.get("lastName") ?? ""),
    password: String(formData.get("password") ?? ""),
    confirmPassword: String(formData.get("confirmPassword") ?? ""),
  });

  if (!parsed.success) {
    const url = buildRequestUrl(request, "/activate");
    url.searchParams.set("error", parsed.error.issues[0]?.message ?? "invalid");
    url.searchParams.set("email", String(formData.get("email") ?? ""));
    return NextResponse.redirect(url, 303);
  }

  const user = getUserByEmail(parsed.data.email);
  if (!user || !user.active) {
    const url = buildRequestUrl(request, "/activate");
    url.searchParams.set("error", "That email is not on the invited list.");
    url.searchParams.set("email", parsed.data.email);
    return NextResponse.redirect(url, 303);
  }

  if (!user.mustChangePassword) {
    const url = buildRequestUrl(request, "/login");
    url.searchParams.set("error", "account-ready");
    url.searchParams.set("next", user.role === "student" ? "/submit" : "/");
    return NextResponse.redirect(url, 303);
  }

  updateUserActivationByEmail({
    email: parsed.data.email,
    passwordHash: hashPassword(parsed.data.password),
    firstName: parsed.data.firstName,
    lastName: parsed.data.lastName,
  });
  const session = createAppSession(user.id);
  const response = NextResponse.redirect(
    buildRequestUrl(request, user.role === "student" ? "/submit" : "/"),
    303,
  );
  response.cookies.set(appSessionCookie, session.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookies(),
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
  return response;
}
