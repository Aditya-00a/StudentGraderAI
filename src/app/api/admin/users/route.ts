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

function requireAdmin(request: Request) {
  if (!isLocalAuthEnabled()) {
    return null;
  }

  const currentUser = getCurrentUserFromCookieHeader(request.headers.get("cookie"));
  if (!currentUser || !userHasRole(currentUser.role, ["admin"])) {
    return null;
  }

  return currentUser;
}

export async function GET(request: Request) {
  const currentUser = requireAdmin(request);
  if (!currentUser) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ users: listUsers() });
}

export async function POST(request: Request) {
  const currentUser = requireAdmin(request);
  if (!currentUser) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = createUserSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: "invalid-request" }, { status: 400 });
  }

  const user = inviteOrUpdateUser({
    ...parsed.data,
    passwordHash: hashPassword(`activate-${crypto.randomUUID()}`),
  });

  return NextResponse.json({ user });
}

export async function PATCH(request: Request) {
  const currentUser = requireAdmin(request);
  if (!currentUser) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = patchUserSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: "invalid-request" }, { status: 400 });
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
