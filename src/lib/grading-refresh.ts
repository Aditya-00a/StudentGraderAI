import "server-only";

import { gradeSubmission, submissionNeedsGradeRefresh } from "@/lib/grading";
import { generateStudentProjectOverview } from "@/lib/project-overview";
import { collectSubmissionArtifacts } from "@/lib/repository-intake";
import {
  getAssignmentById,
  getSubmissionById,
  listSubmissions,
  updateSubmissionArtifacts,
  updateSubmissionFailure,
  updateSubmissionProjectOverview,
  updateSubmissionResult,
} from "@/lib/store";
import type { Submission } from "@/lib/types";

export async function refreshSubmissionGradeIfNeeded(submissionId: string) {
  const submission = await getSubmissionById(submissionId);
  if (!submission || !submissionNeedsGradeRefresh(submission)) {
    return submission;
  }

  const assignment = await getAssignmentById(submission.assignmentId);
  if (!assignment) {
    return submission;
  }

  try {
    const collected = await collectSubmissionArtifacts({
      githubUrl: submission.githubUrl,
      uploads: submission.files,
    });

    await updateSubmissionArtifacts(submission.id, submission.files, collected.previewFiles);

    let refreshedSubmission: Submission = {
      ...submission,
      analyzedFiles: collected.previewFiles,
    };

    try {
      const projectOverview = await generateStudentProjectOverview({
        assignment,
        submission: refreshedSubmission,
        artifacts: collected.artifacts,
        githubRepositoryLabel: collected.githubRepositoryLabel,
      });

      await updateSubmissionProjectOverview(submission.id, projectOverview);
      refreshedSubmission = {
        ...refreshedSubmission,
        projectOverview,
      };
    } catch {
      // Keep auto-refresh resilient if overview generation fails.
    }

    const result = await gradeSubmission({
      assignment,
      submission: refreshedSubmission,
      artifacts: collected.artifacts,
      githubRepositoryLabel: collected.githubRepositoryLabel,
    });

    await updateSubmissionResult(submission.id, result);
    return getSubmissionById(submission.id);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "The submission could not be refreshed.";
    await updateSubmissionFailure(submission.id, message);
    return getSubmissionById(submission.id);
  }
}

export async function refreshOutdatedSubmissionGrades(limit = 3) {
  const submissions = await listSubmissions();
  const stale = submissions.filter(submissionNeedsGradeRefresh).slice(0, limit);

  if (stale.length === 0) {
    return submissions;
  }

  for (const submission of stale) {
    await refreshSubmissionGradeIfNeeded(submission.id);
  }

  return listSubmissions();
}
