import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserFromCookieHeader, isLocalAuthEnabled, userHasRole } from "@/lib/auth";
import { buildRequestUrl } from "@/lib/request-url";
import { explainSandboxRunFailure } from "@/lib/sandbox-feedback";
import { runGithubProjectSandboxCheck, stopSandboxPreview } from "@/lib/sandbox-runner";
import {
  createSubmissionSandboxRun,
  getSubmissionById,
  updateSubmissionSandboxRun,
} from "@/lib/store";

export const runtime = "nodejs";

const runSchema = z.object({
  runtime: z.enum(["node", "python", "docker"]).optional(),
  setupCommand: z.string().trim().max(500).optional().default(""),
  runCommand: z.string().trim().max(500).optional().default(""),
  envVarsText: z.string().max(8000).optional().default(""),
});

function parseEnvVars(input: string) {
  const envVars: Record<string, string> = {};
  const envVarNames: string[] = [];

  for (const rawLine of input.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      throw new Error(
        "Environment variables must use one KEY=value pair per line.",
      );
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1);

    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      throw new Error(`"${key}" is not a valid environment variable name.`);
    }

    envVars[key] = value;
    envVarNames.push(key);
  }

  return {
    envVars,
    envVarNames,
  };
}

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

  await Promise.all(
    submission.sandboxRuns
      .map((run) => run.previewContainerName)
      .filter((name): name is string => Boolean(name))
      .map((name) => stopSandboxPreview(name)),
  );

  const payload = await request.json().catch(() => null);
  const parsed = runSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: "invalid-request" }, { status: 400 });
  }

  let envVars: Record<string, string> = {};
  let envVarNames: string[] = [];

  try {
    const parsedEnvVars = parseEnvVars(parsed.data.envVarsText);
    envVars = parsedEnvVars.envVars;
    envVarNames = parsedEnvVars.envVarNames;
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Environment variables could not be parsed.",
      },
      { status: 400 },
    );
  }

  const run = await createSubmissionSandboxRun(id, {
    runtime: parsed.data.runtime ?? "node",
    setupCommand: parsed.data.setupCommand || null,
    runCommand: parsed.data.runCommand || "Auto-detect",
    envVarNames,
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
      envVars,
    });

    const previewUrl = result.previewHostPort
      ? buildRequestUrl(request, `/api/submissions/${id}/runs/${run.id}/preview`).toString()
      : null;

    const studentExplanation =
      result.exitCode === 0
        ? previewUrl
          ? "The DGX quick check finished successfully, and a temporary preview is available through the sandbox."
          : "The DGX quick check finished successfully. You can still review the logs if you want more detail."
        : await explainSandboxRunFailure({
            runtime: result.runtime,
            setupCommand: result.setupCommand,
            runCommand: result.runCommand,
            logs: result.logs,
            architectureEvidence: result.architectureEvidence,
            heavyDependencyWarning: result.heavyDependencyWarning,
          });

    const updated = await updateSubmissionSandboxRun(id, run.id, {
      runtime: result.runtime,
      setupCommand: result.setupCommand,
      runCommand: result.runCommand,
      envVarNames,
      status: result.exitCode === 0 ? "completed" : "failed",
      summary: result.summary,
      studentExplanation,
      logs: result.logs,
      exitCode: result.exitCode,
      previewUrl,
      previewHostPort: result.previewHostPort ?? null,
      previewContainerName: result.previewContainerName ?? null,
      previewExpiresAt: result.previewExpiresAt ?? null,
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
