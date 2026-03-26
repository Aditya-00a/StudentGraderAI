import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getCurrentUserFromCookieHeader,
  hasProfessorSessionCookie,
  isLocalAuthEnabled,
  isProfessorAccessConfigured,
  userHasRole,
} from "@/lib/auth";
import { generateRubricSuggestion } from "@/lib/rubric";

export const runtime = "nodejs";

const rubricRequestSchema = z.object({
  title: z.string().trim().min(3).max(120),
  courseCode: z.string().trim().min(2).max(40),
  description: z.string().trim().min(20).max(4_000),
  maxScore: z.coerce.number().int().min(1).max(1_000),
});

export async function POST(request: Request) {
  const currentUser = isLocalAuthEnabled()
    ? getCurrentUserFromCookieHeader(request.headers.get("cookie"))
    : null;

  if (isLocalAuthEnabled() && (!currentUser || !userHasRole(currentUser.role, ["faculty", "admin"]))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (
    !isLocalAuthEnabled() &&
    isProfessorAccessConfigured() &&
    !hasProfessorSessionCookie(request.headers.get("cookie"))
  ) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = rubricRequestSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ error: "invalid-request" }, { status: 400 });
  }

  const suggestion = await generateRubricSuggestion(parsed.data);
  return NextResponse.json(suggestion);
}
