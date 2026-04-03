import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getCurrentUserFromCookieHeader,
  hashPassword,
  isLocalAuthEnabled,
  userHasRole,
} from "@/lib/auth";
import {
  inviteOrUpdateUser,
  getUserById,
  listUsers,
  resetUserActivationById,
  updateUserActiveState,
} from "@/lib/local-auth-db";

export const runtime = "nodejs";

const createUserSchema = z.object({
  email: z.string().email().trim().max(160),
  firstName: z.string().trim().min(2).max(80),
  lastName: z.string().trim().min(2).max(80),
  role: z.enum(["student", "faculty", "admin"]),
});

const patchUserSchema = z.object({
  userId: z.string().trim().min(1),
  action: z.enum(["activate", "deactivate", "reset-activation"]),
});

function requireUserManager(request: Request) {
  if (!isLocalAuthEnabled()) {
    return null;
  }

  const currentUser = getCurrentUserFromCookieHeader(request.headers.get("cookie"));
  if (!currentUser || !userHasRole(currentUser.role, ["faculty", "admin"])) {
    return null;
  }

  return currentUser;
}

export async function GET(request: Request) {
  const currentUser = requireUserManager(request);
  if (!currentUser) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const users = listUsers().filter((user) =>
    currentUser.role === "admin" ? true : user.role !== "admin",
  );

  return NextResponse.json({ users });
}

export async function POST(request: Request) {
  const currentUser = requireUserManager(request);
  if (!currentUser) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = createUserSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: "invalid-request" }, { status: 400 });
  }

  if (currentUser.role !== "admin" && parsed.data.role === "admin") {
    return NextResponse.json(
      { error: "Only admins can create admin accounts." },
      { status: 403 },
    );
  }

  const user = inviteOrUpdateUser({
    ...parsed.data,
    passwordHash: hashPassword(`activate-${crypto.randomUUID()}`),
  });

  return NextResponse.json({ user });
}

export async function PATCH(request: Request) {
  const currentUser = requireUserManager(request);
  if (!currentUser) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = patchUserSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: "invalid-request" }, { status: 400 });
  }

  const targetUser = getUserById(parsed.data.userId);
  if (!targetUser) {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }

  if (currentUser.role !== "admin" && targetUser.role === "admin") {
    return NextResponse.json(
      { error: "Only admins can manage admin accounts." },
      { status: 403 },
    );
  }

  if (parsed.data.userId === currentUser.id && parsed.data.action === "deactivate") {
    return NextResponse.json(
      { error: "You cannot deactivate your own admin account." },
      { status: 400 },
    );
  }

  const user =
    parsed.data.action === "activate"
      ? updateUserActiveState(parsed.data.userId, true)
      : parsed.data.action === "deactivate"
        ? updateUserActiveState(parsed.data.userId, false)
        : resetUserActivationById(parsed.data.userId, hashPassword(`activate-${crypto.randomUUID()}`));

  return NextResponse.json({ user });
}
