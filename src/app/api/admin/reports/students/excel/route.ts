import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
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

  const rows = studentUsers.map((user) => {
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

    return {
      "First Name": user.firstName,
      "Last Name": user.lastName,
      Email: user.email,
      Active: user.active ? "Yes" : "No",
      "Needs Activation": user.mustChangePassword ? "Yes" : "No",
      "Submission Count": studentSubmissions.length,
      "Latest Submission Title": latestSubmission
        ? `${latestSubmission.assignmentTitle} - ${latestSubmission.projectName}`
        : "",
      "Latest Submission Status": latestSubmission?.status ?? "",
      "Latest Score": latestSubmission?.score ?? "",
      "Highest Score": highestScore === null ? "" : highestScore,
      "Average Score": averageScore === null ? "" : Number(averageScore.toFixed(2)),
      "Latest Weightage Breakdown": latestWeightageBreakdown,
      "Latest Submitted At": latestSubmission?.createdAt ?? "",
    };
  });

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, "Students");
  const buffer = XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
  }) as Buffer;
  const body = new Uint8Array(buffer);

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="student-report-${new Date()
        .toISOString()
        .slice(0, 10)}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
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
