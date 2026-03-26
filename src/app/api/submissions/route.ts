import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserFromCookieHeader, isLocalAuthEnabled } from "@/lib/auth";
import { buildRequestUrl } from "@/lib/request-url";
import { collectSubmissionArtifacts, persistUploadedFiles } from "@/lib/repository-intake";
import { gradeSubmission } from "@/lib/grading";
import {
  createSubmission,
  getAssignmentById,
  updateSubmissionArtifacts,
  updateSubmissionFailure,
  updateSubmissionResult,
} from "@/lib/store";

export const runtime = "nodejs";

const submissionSchema = z.object({
  assignmentId: z.string().trim().min(1),
  studentName: z.string().trim().min(2).max(120),
  studentEmail: z.string().trim().email().max(160),
  githubUrl: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((value) => value || null),
  notes: z
    .string()
    .trim()
    .max(3_000)
    .optional()
    .transform((value) => value || null),
});

export async function POST(request: Request) {
  const currentUser = isLocalAuthEnabled()
    ? getCurrentUserFromCookieHeader(request.headers.get("cookie"))
    : null;

  if (isLocalAuthEnabled() && (!currentUser || currentUser.role !== "student")) {
    return NextResponse.redirect(buildRequestUrl(request, "/login?next=/submit"), 303);
  }

  const formData = await request.formData();
  const files = formData
    .getAll("projectFiles")
    .filter((value): value is File => value instanceof File && value.size > 0);

  const parsed = submissionSchema.safeParse({
    assignmentId: formData.get("assignmentId"),
    studentName: formData.get("studentName"),
    studentEmail: formData.get("studentEmail"),
    githubUrl: formData.get("githubUrl"),
    notes: formData.get("notes"),
  });

  if (!parsed.success) {
    return NextResponse.redirect(buildSubmitRedirect(request, "submission"), 303);
  }

  const assignment = await getAssignmentById(parsed.data.assignmentId);
  if (!assignment) {
    return NextResponse.redirect(buildSubmitRedirect(request, "assignment-not-found"), 303);
  }

  let submissionId: string | null = null;

  try {
    const submission = await createSubmission({
      assignmentId: assignment.id,
      assignmentTitle: assignment.title,
      ownerUserId: currentUser?.id ?? null,
      ownerRole: currentUser?.role ?? null,
      studentName: parsed.data.studentName,
      studentEmail: parsed.data.studentEmail,
      githubUrl: parsed.data.githubUrl,
      notes: parsed.data.notes,
    });
    submissionId = submission.id;

    const uploads = await persistUploadedFiles(submission.id, files);
    const collected = await collectSubmissionArtifacts({
      githubUrl: parsed.data.githubUrl,
      uploads,
    });

    await updateSubmissionArtifacts(submission.id, uploads, collected.previewFiles);

    const result = await gradeSubmission({
      assignment,
      submission: {
        ...submission,
        files: uploads,
        analyzedFiles: collected.previewFiles,
      },
      artifacts: collected.artifacts,
      githubRepositoryLabel: collected.githubRepositoryLabel,
    });

    await updateSubmissionResult(submission.id, result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "The AI grader could not process this submission.";

    if (submissionId) {
      await updateSubmissionFailure(submissionId, message);
      return NextResponse.redirect(buildSubmitRedirect(request, "processing"), 303);
    }

    if (/Supabase upload failed|Supabase storage is not configured/i.test(message)) {
      return NextResponse.redirect(buildSubmitRedirect(request, "storage"), 303);
    }

    return NextResponse.redirect(buildSubmitRedirect(request, "submission"), 303);
  }

  const redirectUrl = buildRequestUrl(request, "/submit");
  redirectUrl.searchParams.set("submitted", "1");
  return NextResponse.redirect(redirectUrl, 303);
}

function buildSubmitRedirect(request: Request, error: string) {
  const redirectUrl = buildRequestUrl(request, "/submit");
  redirectUrl.searchParams.set("error", error);
  return redirectUrl;
}
