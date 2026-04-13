import { z } from "zod";
import { generateStructuredObject, hasAiProviderConfigured } from "@/lib/ai-provider";
import { gradingResponseJsonSchema } from "@/lib/grading-schema";
import type { Assignment, CollectedArtifact, GradingResult, Submission } from "@/lib/types";

export const currentGradingVersion = 2;

const limits = {
  gradingSummary: 1_200,
  listItem: 280,
  criterion: 80,
  rubricFeedback: 300,
  professorFeedback: 1_500,
} as const;

const gradingResponseSchema = z.object({
  score: z.number(),
  gradingSummary: z.string().min(20).max(limits.gradingSummary),
  strengths: z.array(z.string().min(6).max(limits.listItem)).min(2).max(5),
  improvements: z.array(z.string().min(6).max(limits.listItem)).min(2).max(5),
  rubricBreakdown: z
    .array(
      z.object({
        criterion: z.string().min(2).max(limits.criterion),
        score: z.number(),
        feedback: z.string().min(8).max(limits.rubricFeedback),
      }),
    )
    .min(2)
    .max(6),
  professorFeedback: z.string().min(20).max(limits.professorFeedback),
});

export async function gradeSubmission({
  assignment,
  submission,
  artifacts,
  githubRepositoryLabel,
}: {
  assignment: Assignment;
  submission: Submission;
  artifacts: CollectedArtifact[];
  githubRepositoryLabel: string | null;
}) {
  if (!hasAiProviderConfigured()) {
    throw new Error(
      "No AI provider is configured on the server. Set AI_PROVIDER=ollama with OLLAMA_MODEL, or configure Gemini with GEMINI_API_KEY.",
    );
  }

  if (artifacts.length === 0) {
    throw new Error(
      "No readable source files were found. Upload code files, a zip archive, or a public GitHub repository.",
    );
  }

  const evidenceBlock = artifacts
    .map(
      (artifact) =>
        `FILE: ${artifact.path}\nSOURCE: ${artifact.source}\n\n${artifact.content}\n\n---`,
    )
    .join("\n");

  const projectOverviewBlock = submission.projectOverview
    ? [
        "Project overview summary:",
        submission.projectOverview.summary,
        "",
        `Detected stack: ${submission.projectOverview.detectedStack.join(", ") || "None detected"}`,
        `What to do next: ${submission.projectOverview.whatToDoNext.join(" | ") || "None"}`,
        `Watch out for: ${submission.projectOverview.watchOutFor.join(" | ") || "None"}`,
      ].join("\n")
    : "Project overview summary: Not available.";

  const latestSandboxRun = submission.sandboxRuns[0] ?? null;
  const sandboxRunBlock = latestSandboxRun
    ? [
        "Latest DGX sandbox run:",
        `Status: ${latestSandboxRun.status}`,
        `Runtime: ${latestSandboxRun.runtime}`,
        `Setup command: ${latestSandboxRun.setupCommand ?? "None"}`,
        `Run command: ${latestSandboxRun.runCommand}`,
        `Exit code: ${latestSandboxRun.exitCode ?? "Unknown"}`,
        `Run summary: ${latestSandboxRun.summary ?? "No summary available"}`,
        `Student-facing explanation: ${latestSandboxRun.studentExplanation ?? "None"}`,
        latestSandboxRun.logs
          ? `Sandbox logs excerpt:\n${latestSandboxRun.logs.slice(0, 4000)}`
          : "Sandbox logs excerpt: None captured.",
      ].join("\n")
    : "Latest DGX sandbox run: Not available.";

  const raw = await generateStructuredObject({
    geminiModel: process.env.GEMINI_MODEL || "gemini-2.5-flash",
    ollamaModel: process.env.OLLAMA_MODEL || "gemma3:27b",
    systemInstruction:
      "You are a fair but demanding professor assistant. Grade only from the provided evidence. Never invent features that are not present. Distinguish carefully between a weak project and limited sandbox runtime evidence. If the repository, documentation, tests, architecture, or sandbox startup evidence are strong, do not collapse the implementation score solely because a full live preview or production deployment was not available. Feedback should be specific, constructive, and written in plain language a student can act on.",
    prompt: [
      `Assignment title: ${assignment.title}`,
      `Course: ${assignment.courseCode}`,
      `Maximum score: ${assignment.maxScore}`,
      `Grading focus: ${assignment.gradingFocus}`,
      `Rubric: ${assignment.rubric}`,
      `Student: ${submission.studentName} (${submission.studentEmail})`,
      `Submission notes: ${submission.notes ?? "None provided"}`,
      `GitHub repository: ${githubRepositoryLabel ?? submission.githubUrl ?? "Not provided"}`,
      "Return a rigorous grade with concrete evidence. The rubric breakdown scores must stay within the assignment scale and should add up roughly to the final score without exceeding the maximum.",
      "When implementation evidence is mixed, use these distinctions:",
      "- Strong repository architecture, testing, CI, documentation, and successful sandbox startup/build evidence should earn meaningful credit.",
      "- Missing environment variables, unavailable external ports, or incomplete live preview evidence should reduce confidence, but should not be treated the same as a broken or low-quality codebase.",
      "- If runtime evidence is limited, say that explicitly in feedback instead of assuming the implementation is poor.",
      "Keep every strengths/improvements bullet under 280 characters and every rubric feedback note under 300 characters.",
      "",
      "Assignment brief:",
      assignment.description,
      "",
      projectOverviewBlock,
      "",
      sandboxRunBlock,
      "",
      "Submission evidence:",
      evidenceBlock,
    ].join("\n"),
    schema: gradingResponseJsonSchema as unknown as Record<string, unknown>,
  });

  const parsed = gradingResponseSchema.parse(sanitizeGradingPayload(raw));

  return {
    score: clamp(parsed.score, 0, assignment.maxScore),
    gradingSummary: parsed.gradingSummary,
    strengths: parsed.strengths,
    improvements: parsed.improvements,
    rubricBreakdown: parsed.rubricBreakdown.map((item) => ({
      ...item,
      score: clamp(item.score, 0, assignment.maxScore),
    })),
    professorFeedback: parsed.professorFeedback,
  } satisfies GradingResult;
}

export function submissionNeedsGradeRefresh(submission: Submission) {
  return submission.status === "graded" && (submission.gradingVersion ?? 0) < currentGradingVersion;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function sanitizeGradingPayload(payload: unknown) {
  const data = (payload ?? {}) as Record<string, unknown>;

  return {
    score: typeof data.score === "number" ? data.score : Number(data.score ?? 0),
    gradingSummary: normalizeText(data.gradingSummary, limits.gradingSummary),
    strengths: normalizeStringList(data.strengths, limits.listItem),
    improvements: normalizeStringList(data.improvements, limits.listItem),
    rubricBreakdown: normalizeRubricBreakdown(data.rubricBreakdown),
    professorFeedback: normalizeText(data.professorFeedback, limits.professorFeedback),
  };
}

function normalizeStringList(value: unknown, maximum: number) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => normalizeText(item, maximum))
    .filter((item) => item.length >= 6)
    .slice(0, 5);
}

function normalizeRubricBreakdown(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const entry = item as Record<string, unknown>;

      return {
        criterion: normalizeText(entry?.criterion, limits.criterion),
        score: typeof entry?.score === "number" ? entry.score : Number(entry?.score ?? 0),
        feedback: normalizeText(entry?.feedback, limits.rubricFeedback),
      };
    })
    .filter((item) => item.criterion.length >= 2 && item.feedback.length >= 8)
    .slice(0, 6);
}

function normalizeText(value: unknown, maximum: number) {
  const text = typeof value === "string" ? value : "";
  const compact = text.replace(/\s+/g, " ").trim();

  if (compact.length <= maximum) {
    return compact;
  }

  return compact.slice(0, maximum - 3).trimEnd() + "...";
}
