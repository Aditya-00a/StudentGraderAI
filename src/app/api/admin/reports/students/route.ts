import { NextResponse } from "next/server";
import {
  getCurrentUserFromCookieHeader,
  isLocalAuthEnabled,
  userHasRole,
} from "@/lib/auth";
import { listUsers } from "@/lib/local-auth-db";
import { listSubmissions } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isLocalAuthEnabled()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const currentUser = getCurrentUserFromCookieHeader(request.headers.get("cookie"));
  if (!currentUser || !userHasRole(currentUser.role, ["faculty", "admin"])) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [users, submissions] = await Promise.all([listUsers(), listSubmissions()]);
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
      "average_score",
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
        averageScore === null ? "" : averageScore.toFixed(2),
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
