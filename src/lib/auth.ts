import "server-only";

import crypto from "node:crypto";
import type { ReadonlyRequestCookies } from "next/dist/server/web/spec-extension/adapters/request-cookies";
import { cookies } from "next/headers";
import { deleteExpiredSessions, deleteSession, getUserByEmail, getUserBySessionToken, getUserPasswordHash, hasLocalUsers, insertSession } from "@/lib/local-auth-db";
import type { AppRole } from "@/lib/types";

export const appSessionCookie = "student-grader-session";
export const professorSessionCookie = "student-grader-professor";

function getNormalizedProfessorAccessKey() {
  return (process.env.PROFESSOR_ACCESS_KEY || "").trim();
}

export function isProfessorAccessConfigured() {
  return Boolean(getNormalizedProfessorAccessKey());
}

export function isProfessorPasswordValid(password: string) {
  const configuredPassword = getNormalizedProfessorAccessKey();
  return Boolean(configuredPassword) && password.trim() === configuredPassword;
}

export function hasProfessorSessionCookie(cookieHeader: string | null) {
  if (!cookieHeader) {
    return false;
  }

  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .some((part) => part === `${professorSessionCookie}=1`);
}

export function isLocalAuthEnabled() {
  return hasLocalUsers();
}

export function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, passwordHash: string) {
  const [salt, storedHash] = passwordHash.split(":");
  if (!salt || !storedHash) {
    return false;
  }

  const computed = crypto.scryptSync(password, salt, 64);
  const stored = Buffer.from(storedHash, "hex");

  if (computed.length !== stored.length) {
    return false;
  }

  return crypto.timingSafeEqual(computed, stored);
}

export function authenticateLocalUser(email: string, password: string) {
  const user = getUserByEmail(email);
  if (!user || !user.active) {
    return null;
  }

  const passwordHash = getUserPasswordHash(email);
  if (!passwordHash || !verifyPassword(password, passwordHash)) {
    return null;
  }

  return user;
}

export function createAppSession(userId: string) {
  deleteExpiredSessions();
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString();
  insertSession(token, userId, expiresAt);
  return { token, expiresAt };
}

export function parseSessionToken(cookieHeader: string | null) {
  if (!cookieHeader) {
    return null;
  }

  const entry = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${appSessionCookie}=`));

  return entry ? entry.slice(appSessionCookie.length + 1) : null;
}

export function getCurrentUserFromCookieHeader(cookieHeader: string | null) {
  const token = parseSessionToken(cookieHeader);
  if (!token) {
    return null;
  }

  return getUserBySessionToken(token);
}

export async function getCurrentUserFromCookies() {
  const cookieStore = await cookies();
  return getCurrentUserFromCookieStore(cookieStore);
}

export function getCurrentUserFromCookieStore(cookieStore: ReadonlyRequestCookies) {
  const token = cookieStore.get(appSessionCookie)?.value;
  if (!token) {
    return null;
  }

  return getUserBySessionToken(token);
}

export function clearAppSession(cookieHeader: string | null) {
  const token = parseSessionToken(cookieHeader);
  if (token) {
    deleteSession(token);
  }
}

export function userHasRole(role: AppRole, allowedRoles: AppRole[]) {
  return allowedRoles.includes(role);
}

export function shouldUseSecureCookies() {
  const explicit = (process.env.SESSION_COOKIE_SECURE || "").trim().toLowerCase();

  if (explicit === "true") {
    return true;
  }

  if (explicit === "false") {
    return false;
  }

  const appUrl = (process.env.APP_BASE_URL || "").trim().toLowerCase();
  return appUrl.startsWith("https://");
}
