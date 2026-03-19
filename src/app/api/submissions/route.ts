import { NextResponse } from "next/server";
import { z } from "zod";
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
    const redirectUrl = new URL("/", request.url);
    redirectUrl.hash = "student-submit";
    redirectUrl.searchParams.set("error", "submission");
    return NextResponse.redirect(redirectUrl, 303);
  }

  const assignment = await getAssignmentById(parsed.data.assignmentId);
  if (!assignment) {
    const redirectUrl = new URL("/", request.url);
    redirectUrl.hash = "student-submit";
    redirectUrl.searchParams.set("error", "assignment-not-found");
    return NextResponse.redirect(redirectUrl, 303);
  }

  const submission = await createSubmission({
    assignmentId: assignment.id,
    assignmentTitle: assignment.title,
    studentName: parsed.data.studentName,
    studentEmail: parsed.data.studentEmail,
    githubUrl: parsed.data.githubUrl,
    notes: parsed.data.notes,
  });

  try {
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
    await updateSubmissionFailure(submission.id, message);
  }

  return NextResponse.redirect(new URL(`/submissions/${submission.id}`, request.url), 303);
}
