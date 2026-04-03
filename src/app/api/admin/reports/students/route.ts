import { NextResponse } from "next/server";
import {
  getCurrentUserFromCookieHeader,
  isLocalAuthEnabled,
  userHasRole,
} from "@/lib/auth";
import { listUsers } from "@/lib/local-auth-db";
import { listAssignments, listSubmissions } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isLocalAuthEnabled()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const currentUser = getCurrentUserFromCookieHeader(request.headers.get("cookie"));
  if (!currentUser || !userHasRole(currentUser.role, ["faculty", "admin"])) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [users, submissions, assignments] = await Promise.all([
    listUsers(),
    listSubmissions(),
    listAssignments(),
  ]);
  const assignmentMaxScore = new Map(assignments.map((assignment) => [assignment.id, assignment.maxScore]));
  const studentUsers = users.filter((user) => user.role === "student");

  const csvRows = [
    [
      "first_name",
      "last_name",
      "email",
      "active",
      "needs_activation",
      "submission_count",
      "latest_submission_title",
      "latest_submission_status",
      "latest_score",
      "highest_score",
      "average_score",
      "latest_weightage_breakdown",
      "latest_submitted_at",
    ],
    ...studentUsers.map((user) => {
      const studentSubmissions = submissions.filter(
        (submission) =>
          submission.studentEmail.trim().toLowerCase() === user.email.trim().toLowerCase(),
      );
      const latestSubmission = [...studentSubmissions].sort((left, right) =>
        right.createdAt.localeCompare(left.createdAt),
      )[0];
      const graded = studentSubmissions.filter(
        (submission) => typeof submission.score === "number",
      );
      const averageScore =
        graded.length > 0
          ? graded.reduce((sum, submission) => sum + (submission.score ?? 0), 0) / graded.length
          : null;
      const highestScore =
        graded.length > 0
          ? Math.max(...graded.map((submission) => submission.score ?? 0))
          : null;
      const latestWeightageBreakdown = latestSubmission
        ? buildWeightageBreakdown(
            latestSubmission.rubricBreakdown,
            assignmentMaxScore.get(latestSubmission.assignmentId) ?? null,
          )
        : "";

      return [
        user.firstName,
        user.lastName,
        user.email,
        user.active ? "yes" : "no",
        user.mustChangePassword ? "yes" : "no",
        String(studentSubmissions.length),
        latestSubmission
          ? `${latestSubmission.assignmentTitle} - ${latestSubmission.projectName}`
          : "",
        latestSubmission?.status ?? "",
        latestSubmission?.score === null || latestSubmission?.score === undefined
          ? ""
          : String(latestSubmission.score),
        highestScore === null ? "" : String(highestScore),
        averageScore === null ? "" : averageScore.toFixed(2),
        latestWeightageBreakdown,
        latestSubmission?.createdAt ?? "",
      ];
    }),
  ];

  const csv = csvRows.map((row) => row.map(escapeCsvCell).join(",")).join("\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="student-report-${new Date()
        .toISOString()
        .slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

function escapeCsvCell(value: string) {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return value;
}

function buildWeightageBreakdown(
  rubricBreakdown: { criterion: string; score: number }[],
  maxScore: number | null,
) {
  if (!Array.isArray(rubricBreakdown) || rubricBreakdown.length === 0) {
    return "";
  }

  return rubricBreakdown
    .map((item) => {
      const percentage =
        typeof maxScore === "number" && maxScore > 0
          ? ` (${((item.score / maxScore) * 100).toFixed(1)}%)`
          : "";
      return `${item.criterion}: ${item.score}${maxScore ? `/${maxScore}` : ""}${percentage}`;
    })
    .join("; ");
}
