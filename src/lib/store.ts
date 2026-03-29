import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
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
  StudentProjectOverview,
  SubmissionChatMessage,
  SubmissionSandboxRun,
  StoredUpload,
  Submission,
} from "@/lib/types";
import { dataDirectory } from "@/lib/paths";

const databasePath = `${dataDirectory}/student-grader-ai.json`;
const databaseBlobPath = "app-data/student-grader-ai.json";
const databaseTempPath = `${databasePath}.tmp`;

const emptyDatabase: Database = {
  assignments: [],
  submissions: [],
};

let mutationQueue: Promise<void> = Promise.resolve();

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
  await mutationQueue;
  return readDatabaseFile();
}

async function readDatabaseFile() {
  await ensureDatabase();
  const raw = hasSupabaseStorageConfigured()
    ? await readSupabaseText(databaseBlobPath)
    : hasBlobStorageConfigured()
      ? await readPrivateBlobText(databaseBlobPath)
      : await readFile(databasePath, "utf8");

  if (!raw) {
    return emptyDatabase;
  }

  return parseDatabaseText(raw);
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

  await writeFile(databaseTempPath, JSON.stringify(database, null, 2), "utf8");
  await rename(databaseTempPath, databasePath);
}

async function mutateDatabase<T>(mutator: (database: Database) => Promise<T> | T) {
  const runMutation = async () => {
    const database = await readDatabaseFile();
    const outcome = await mutator(database);
    await writeDatabase(database);
    return outcome;
  };

  const result = mutationQueue.then(runMutation, runMutation);

  mutationQueue = result.then(
    () => undefined,
    () => undefined,
  );

  return result;
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
  return mutateDatabase(async (database) => {
    const assignment: Assignment = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      ...input,
    };

    database.assignments.push(assignment);
    return assignment;
  });
}

export async function createSubmission(
  input: Pick<
    Submission,
    | "assignmentId"
    | "assignmentTitle"
    | "projectName"
    | "ownerUserId"
    | "ownerRole"
    | "studentName"
    | "studentEmail"
    | "githubUrl"
    | "notes"
  >,
) {
  return mutateDatabase(async (database) => {
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
      projectOverview: null,
      chatHistory: [],
      sandboxRuns: [],
      ...input,
    };

    database.submissions.push(submission);
    return submission;
  });
}

export async function appendSubmissionChatMessage(
  submissionId: string,
  message: Omit<SubmissionChatMessage, "id" | "createdAt">,
) {
  return mutateDatabase(async (database) => {
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
    return nextMessage;
  });
}

export async function createSubmissionSandboxRun(
  submissionId: string,
  input: Omit<
    SubmissionSandboxRun,
    "id" | "startedAt" | "finishedAt" | "status" | "summary" | "studentExplanation" | "logs" | "exitCode"
  >,
) {
  return mutateDatabase(async (database) => {
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
      studentExplanation: null,
      logs: "",
      exitCode: null,
      ...input,
    };

    submission.sandboxRuns.unshift(run);
    return run;
  });
}

export async function updateSubmissionSandboxRun(
  submissionId: string,
  runId: string,
  patch: Partial<SubmissionSandboxRun>,
) {
  return mutateDatabase(async (database) => {
    const submission = database.submissions.find((item) => item.id === submissionId);

    if (!submission) {
      return null;
    }

    const run = submission.sandboxRuns.find((item) => item.id === runId);
    if (!run) {
      return null;
    }

    Object.assign(run, patch);
    return run;
  });
}

export async function updateSubmissionProjectOverview(
  submissionId: string,
  projectOverview: StudentProjectOverview,
) {
  return mutateDatabase(async (database) => {
    const submission = database.submissions.find((item) => item.id === submissionId);

    if (!submission) {
      return null;
    }

    submission.projectOverview = projectOverview;
    return submission;
  });
}

function parseDatabaseText(raw: string) {
  try {
    return normalizeDatabase(JSON.parse(raw) as Database);
  } catch {
    const recovered = recoverFirstJsonObject(raw);
    return normalizeDatabase(JSON.parse(recovered) as Database);
  }
}

function recoverFirstJsonObject(raw: string) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  let started = false;

  for (let index = 0; index < raw.length; index += 1) {
    const character = raw[index];

    if (!started) {
      if (character === "{") {
        started = true;
        depth = 1;
      }
      continue;
    }

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === "\"") {
        inString = false;
      }
      continue;
    }

    if (character === "\"") {
      inString = true;
      continue;
    }

    if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return raw.slice(raw.indexOf("{"), index + 1);
      }
    }
  }

  throw new Error("The submission database could not be parsed.");
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
    projectName: submission.projectName ?? "Project",
    files: Array.isArray(submission.files) ? submission.files : [],
    analyzedFiles: Array.isArray(submission.analyzedFiles) ? submission.analyzedFiles : [],
    strengths: Array.isArray(submission.strengths) ? submission.strengths : [],
    improvements: Array.isArray(submission.improvements) ? submission.improvements : [],
    rubricBreakdown: Array.isArray(submission.rubricBreakdown) ? submission.rubricBreakdown : [],
    projectOverview: submission.projectOverview ?? null,
    chatHistory: Array.isArray(submission.chatHistory) ? submission.chatHistory : [],
    sandboxRuns: Array.isArray(submission.sandboxRuns)
      ? submission.sandboxRuns.map((run) => ({
          ...run,
          studentExplanation: run.studentExplanation ?? null,
        }))
      : [],
  };
}

export async function updateSubmissionArtifacts(
  submissionId: string,
  files: StoredUpload[],
  analyzedFiles: ArtifactPreview[],
) {
  return mutateDatabase(async (database) => {
    const submission = database.submissions.find((item) => item.id === submissionId);

    if (!submission) {
      return null;
    }

    submission.files = files;
    submission.analyzedFiles = analyzedFiles;
    return submission;
  });
}

export async function updateSubmissionResult(submissionId: string, result: GradingResult) {
  return mutateDatabase(async (database) => {
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

    return submission;
  });
}

export async function updateSubmissionFailure(submissionId: string, errorMessage: string) {
  return mutateDatabase(async (database) => {
    const submission = database.submissions.find((item) => item.id === submissionId);

    if (!submission) {
      return null;
    }

    submission.status = "failed";
    submission.errorMessage = errorMessage;
    return submission;
  });
}
