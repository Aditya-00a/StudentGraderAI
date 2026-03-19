import { NextResponse } from "next/server";
import { z } from "zod";
import { createAssignment } from "@/lib/store";

export const runtime = "nodejs";

const assignmentSchema = z.object({
  title: z.string().trim().min(3).max(120),
  courseCode: z.string().trim().min(2).max(40),
  description: z.string().trim().min(20).max(4_000),
  maxScore: z.coerce.number().int().min(1).max(1_000),
  ratingLabel: z.string().trim().min(1).max(20),
  gradingFocus: z.string().trim().min(10).max(2_000),
  rubric: z.string().trim().min(20).max(8_000),
});

export async function POST(request: Request) {
  const formData = await request.formData();

  const parsed = assignmentSchema.safeParse({
    title: formData.get("title"),
    courseCode: formData.get("courseCode"),
    description: formData.get("description"),
    maxScore: formData.get("maxScore"),
    ratingLabel: formData.get("ratingLabel"),
    gradingFocus: formData.get("gradingFocus"),
    rubric: formData.get("rubric"),
  });

  const redirectUrl = new URL("/", request.url);
  redirectUrl.hash = "professor-console";

  if (!parsed.success) {
    redirectUrl.searchParams.set("error", "assignment");
    return NextResponse.redirect(redirectUrl, 303);
  }

  await createAssignment(parsed.data);
  redirectUrl.searchParams.set("created", "assignment");
  return NextResponse.redirect(redirectUrl, 303);
}
