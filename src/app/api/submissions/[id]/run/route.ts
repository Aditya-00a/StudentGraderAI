import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserFromCookieHeader, isLocalAuthEnabled, userHasRole } from "@/lib/auth";
import { explainSandboxRunFailure } from "@/lib/sandbox-feedback";
import { runGithubProjectSandboxCheck } from "@/lib/sandbox-runner";
import {
  createSubmissionSandboxRun,
  getSubmissionById,
  updateSubmissionSandboxRun,
} from "@/lib/store";

export const runtime = "nodejs";

const runSchema = z.object({
  runtime: z.enum(["node", "python"]).optional(),
  setupCommand: z.string().trim().max(500).optional().default(""),
  runCommand: z.string().trim().max(500).optional().default(""),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const currentUser = isLocalAuthEnabled()
    ? getCurrentUserFromCookieHeader(request.headers.get("cookie"))
    : null;

  if (isLocalAuthEnabled() && !currentUser) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const submission = await getSubmissionById(id);

  if (!submission) {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }

  if (
    currentUser &&
    currentUser.role === "student" &&
    submission.studentEmail.trim().toLowerCase() !== currentUser.email.trim().toLowerCase()
  ) {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }

  if (
    currentUser &&
    !userHasRole(currentUser.role, ["student", "faculty", "admin"])
  ) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!submission.githubUrl) {
    return NextResponse.json(
      { error: "A public GitHub repository link is required for DGX sandbox runs." },
      { status: 400 },
    );
  }

  const payload = await request.json().catch(() => null);
  const parsed = runSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: "invalid-request" }, { status: 400 });
  }

  const run = await createSubmissionSandboxRun(id, {
    runtime: parsed.data.runtime ?? "node",
    setupCommand: parsed.data.setupCommand || null,
    runCommand: parsed.data.runCommand || "Auto-detect",
  });

  if (!run) {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }

  try {
    const result = await runGithubProjectSandboxCheck({
      githubUrl: submission.githubUrl,
      runtime: parsed.data.runtime ?? null,
      setupCommand: parsed.data.setupCommand || null,
      runCommand: parsed.data.runCommand || null,
    });

    const studentExplanation =
      result.exitCode === 0
        ? "The DGX quick check finished successfully. You can still review the logs if you want more detail."
        : await explainSandboxRunFailure({
            runtime: result.runtime,
            setupCommand: result.setupCommand,
            runCommand: result.runCommand,
            logs: result.logs,
          });

    const updated = await updateSubmissionSandboxRun(id, run.id, {
      runtime: result.runtime,
      setupCommand: result.setupCommand,
      runCommand: result.runCommand,
      status: result.exitCode === 0 ? "completed" : "failed",
      summary: result.summary,
      studentExplanation,
      logs: result.logs,
      exitCode: result.exitCode,
      finishedAt: new Date().toISOString(),
    });

    return NextResponse.json({ run: updated });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "The DGX sandbox could not run this project.";

    const updated = await updateSubmissionSandboxRun(id, run.id, {
      status: "failed",
      summary: message,
      studentExplanation: message,
      logs: message,
      exitCode: 1,
      finishedAt: new Date().toISOString(),
    });

    return NextResponse.json({ run: updated, error: message }, { status: 200 });
  }
}
