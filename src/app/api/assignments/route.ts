import { NextResponse } from "next/server";
import { z } from "zod";
import { createAssignment } from "@/lib/store";
import { generateRubricSuggestion } from "@/lib/rubric";

export const runtime = "nodejs";

const assignmentSchema = z.object({
  title: z.string().trim().min(3).max(120),
  courseCode: z.string().trim().min(2).max(40),
  description: z.string().trim().min(20).max(4_000),
  maxScore: z.coerce.number().int().min(1).max(1_000),
  gradingFocus: z.string().trim().max(2_000).optional().default(""),
  rubric: z.string().trim().max(8_000).optional().default(""),
});

export async function POST(request: Request) {
  const formData = await request.formData();

  const parsed = assignmentSchema.safeParse({
    title: formData.get("title"),
    courseCode: formData.get("courseCode"),
    description: formData.get("description"),
    maxScore: formData.get("maxScore"),
    gradingFocus: formData.get("gradingFocus"),
    rubric: formData.get("rubric"),
  });

  const redirectUrl = new URL("/", request.url);
  redirectUrl.hash = "professor-console";

  if (!parsed.success) {
    redirectUrl.searchParams.set("error", "assignment");
    return NextResponse.redirect(redirectUrl, 303);
  }

  let { gradingFocus, rubric } = parsed.data;

  if (!gradingFocus || !rubric) {
    const suggestion = await generateRubricSuggestion({
      title: parsed.data.title,
      courseCode: parsed.data.courseCode,
      description: parsed.data.description,
      maxScore: parsed.data.maxScore,
    });
    gradingFocus = gradingFocus || suggestion.gradingFocus;
    rubric = rubric || suggestion.rubric;
  }

  await createAssignment({
    ...parsed.data,
    gradingFocus,
    rubric,
  });
  redirectUrl.searchParams.set("created", "assignment");
  return NextResponse.redirect(redirectUrl, 303);
}
