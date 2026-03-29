import { mkdir, readFile, writeFile } from "node:fs/promises";
import crypto from "node:crypto";
import {
  hasBlobStorageConfigured,
  readPrivateBlobText,
  writePrivateBlob,
} from "@/lib/blob-storage";
import {
  hasSupabaseStorageConfigured,
  readSupabaseText,
  writeSupabaseFile,
} from "@/lib/supabase-storage";
import type {
  ArtifactPreview,
  Assignment,
  Database,
  GradingResult,
  SubmissionChatMessage,
  SubmissionSandboxRun,
  StoredUpload,
  Submission,
} from "@/lib/types";
import { dataDirectory } from "@/lib/paths";

const databasePath = `${dataDirectory}/student-grader-ai.json`;
const databaseBlobPath = "app-data/student-grader-ai.json";

const emptyDatabase: Database = {
  assignments: [],
  submissions: [],
};

async function ensureDatabase() {
  if (hasSupabaseStorageConfigured()) {
    const existing = await readSupabaseText(databaseBlobPath);
    if (!existing) {
      await writeSupabaseFile(
        databaseBlobPath,
        JSON.stringify(emptyDatabase, null, 2),
        "application/json",
      );
    }
    return;
  }

  if (hasBlobStorageConfigured()) {
    const existing = await readPrivateBlobText(databaseBlobPath);
    if (!existing) {
      await writePrivateBlob(databaseBlobPath, JSON.stringify(emptyDatabase, null, 2));
    }
    return;
  }

  await mkdir(dataDirectory, { recursive: true });

  try {
    await readFile(databasePath, "utf8");
  } catch {
    await writeFile(databasePath, JSON.stringify(emptyDatabase, null, 2), "utf8");
  }
}

async function readDatabase() {
  await ensureDatabase();
  const raw = hasSupabaseStorageConfigured()
    ? await readSupabaseText(databaseBlobPath)
    : hasBlobStorageConfigured()
      ? await readPrivateBlobText(databaseBlobPath)
      : await readFile(databasePath, "utf8");

  if (!raw) {
    return emptyDatabase;
  }

  return normalizeDatabase(JSON.parse(raw) as Database);
}

async function writeDatabase(database: Database) {
  await ensureDatabase();

  if (hasSupabaseStorageConfigured()) {
    await writeSupabaseFile(
      databaseBlobPath,
      JSON.stringify(database, null, 2),
      "application/json",
    );
    return;
  }

  if (hasBlobStorageConfigured()) {
    await writePrivateBlob(databaseBlobPath, JSON.stringify(database, null, 2));
    return;
  }

  await writeFile(databasePath, JSON.stringify(database, null, 2), "utf8");
}

export async function listAssignments() {
  const database = await readDatabase();
  return [...database.assignments].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
}

export async function listSubmissions() {
  const database = await readDatabase();
  return [...database.submissions].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
}

export async function listSubmissionsByStudentEmail(studentEmail: string) {
  const normalizedEmail = studentEmail.trim().toLowerCase();
  const database = await readDatabase();
  return database.submissions
    .filter((submission) => submission.studentEmail.trim().toLowerCase() === normalizedEmail)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function getAssignmentById(id: string) {
  const database = await readDatabase();
  return database.assignments.find((assignment) => assignment.id === id) ?? null;
}

export async function getSubmissionById(id: string) {
  const database = await readDatabase();
  return database.submissions.find((submission) => submission.id === id) ?? null;
}

export async function createAssignment(input: Omit<Assignment, "id" | "createdAt">) {
  const database = await readDatabase();
  const assignment: Assignment = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    ...input,
  };

  database.assignments.push(assignment);
  await writeDatabase(database);
  return assignment;
}

export async function createSubmission(
  input: Pick<
    Submission,
    | "assignmentId"
    | "assignmentTitle"
    | "ownerUserId"
    | "ownerRole"
    | "studentName"
    | "studentEmail"
    | "githubUrl"
    | "notes"
  >,
) {
  const database = await readDatabase();
  const submission: Submission = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    status: "processing",
    files: [],
    analyzedFiles: [],
    score: null,
    gradingSummary: null,
    strengths: [],
    improvements: [],
    rubricBreakdown: [],
    professorFeedback: null,
    errorMessage: null,
    chatHistory: [],
    sandboxRuns: [],
    ...input,
  };

  database.submissions.push(submission);
  await writeDatabase(database);
  return submission;
}

export async function appendSubmissionChatMessage(
  submissionId: string,
  message: Omit<SubmissionChatMessage, "id" | "createdAt">,
) {
  const database = await readDatabase();
  const submission = database.submissions.find((item) => item.id === submissionId);

  if (!submission) {
    return null;
  }

  const nextMessage: SubmissionChatMessage = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    ...message,
  };

  submission.chatHistory.push(nextMessage);
  await writeDatabase(database);
  return nextMessage;
}

export async function createSubmissionSandboxRun(
  submissionId: string,
  input: Omit<SubmissionSandboxRun, "id" | "startedAt" | "finishedAt" | "status" | "summary" | "logs" | "exitCode">,
) {
  const database = await readDatabase();
  const submission = database.submissions.find((item) => item.id === submissionId);

  if (!submission) {
    return null;
  }

  const run: SubmissionSandboxRun = {
    id: crypto.randomUUID(),
    startedAt: new Date().toISOString(),
    finishedAt: null,
    status: "running",
    summary: null,
    logs: "",
    exitCode: null,
    ...input,
  };

  submission.sandboxRuns.unshift(run);
  await writeDatabase(database);
  return run;
}

export async function updateSubmissionSandboxRun(
  submissionId: string,
  runId: string,
  patch: Partial<SubmissionSandboxRun>,
) {
  const database = await readDatabase();
  const submission = database.submissions.find((item) => item.id === submissionId);

  if (!submission) {
    return null;
  }

  const run = submission.sandboxRuns.find((item) => item.id === runId);
  if (!run) {
    return null;
  }

  Object.assign(run, patch);
  await writeDatabase(database);
  return run;
}

function normalizeDatabase(database: Database): Database {
  return {
    assignments: Array.isArray(database.assignments) ? database.assignments : [],
    submissions: Array.isArray(database.submissions)
      ? database.submissions.map(normalizeSubmission)
      : [],
  };
}

function normalizeSubmission(submission: Submission): Submission {
  return {
    ...submission,
    files: Array.isArray(submission.files) ? submission.files : [],
    analyzedFiles: Array.isArray(submission.analyzedFiles) ? submission.analyzedFiles : [],
    strengths: Array.isArray(submission.strengths) ? submission.strengths : [],
    improvements: Array.isArray(submission.improvements) ? submission.improvements : [],
    rubricBreakdown: Array.isArray(submission.rubricBreakdown) ? submission.rubricBreakdown : [],
    chatHistory: Array.isArray(submission.chatHistory) ? submission.chatHistory : [],
    sandboxRuns: Array.isArray(submission.sandboxRuns) ? submission.sandboxRuns : [],
  };
}

export async function updateSubmissionArtifacts(
  submissionId: string,
  files: StoredUpload[],
  analyzedFiles: ArtifactPreview[],
) {
  const database = await readDatabase();
  const submission = database.submissions.find((item) => item.id === submissionId);

  if (!submission) {
    return null;
  }

  submission.files = files;
  submission.analyzedFiles = analyzedFiles;
  await writeDatabase(database);
  return submission;
}

export async function updateSubmissionResult(submissionId: string, result: GradingResult) {
  const database = await readDatabase();
  const submission = database.submissions.find((item) => item.id === submissionId);

  if (!submission) {
    return null;
  }

  submission.status = "graded";
  submission.score = result.score;
  submission.gradingSummary = result.gradingSummary;
  submission.strengths = result.strengths;
  submission.improvements = result.improvements;
  submission.rubricBreakdown = result.rubricBreakdown;
  submission.professorFeedback = result.professorFeedback;
  submission.errorMessage = null;

  await writeDatabase(database);
  return submission;
}

export async function updateSubmissionFailure(submissionId: string, errorMessage: string) {
  const database = await readDatabase();
  const submission = database.submissions.find((item) => item.id === submissionId);

  if (!submission) {
    return null;
  }

  submission.status = "failed";
  submission.errorMessage = errorMessage;
  await writeDatabase(database);
  return submission;
}
