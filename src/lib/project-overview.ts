import { z } from "zod";
import { generateStructuredObject, hasAiProviderConfigured } from "@/lib/ai-provider";
import type {
  Assignment,
  CollectedArtifact,
  StudentProjectOverview,
  Submission,
} from "@/lib/types";

const overviewSchema = z.object({
  summary: z.string().min(20).max(500),
  detectedStack: z.array(z.string().min(2).max(80)).min(1).max(5),
  whatToDoNext: z.array(z.string().min(8).max(180)).min(2).max(4),
  watchOutFor: z.array(z.string().min(8).max(180)).max(4),
});

export async function generateStudentProjectOverview({
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
  const fallback = buildFallbackOverview(artifacts);

  if (!hasAiProviderConfigured() || artifacts.length === 0) {
    return fallback;
  }

  const evidenceBlock = artifacts
    .slice(0, 20)
    .map(
      (artifact) =>
        `FILE: ${artifact.path}\nSOURCE: ${artifact.source}\n\n${artifact.content}\n\n---`,
    )
    .join("\n");

  try {
    const raw = await generateStructuredObject({
      geminiModel: process.env.GEMINI_MODEL || "gemini-2.5-flash",
      ollamaModel: process.env.OLLAMA_MODEL || "gemma3:27b",
      systemInstruction:
        "You are helping a student understand their project workspace. Summarize what the repository appears to be, what technologies are present, what they should do next, and what might break. Be encouraging, concrete, and student-friendly.",
      prompt: [
        `Assignment: ${assignment.title}`,
        `Student: ${submission.studentName}`,
        `GitHub repository: ${githubRepositoryLabel ?? submission.githubUrl ?? "Not provided"}`,
        submission.notes ? `Student notes: ${submission.notes}` : "Student notes: None",
        "",
        "Project evidence:",
        evidenceBlock,
      ].join("\n"),
      schema: {
        type: "object",
        properties: {
          summary: { type: "string" },
          detectedStack: {
            type: "array",
            items: { type: "string" },
          },
          whatToDoNext: {
            type: "array",
            items: { type: "string" },
          },
          watchOutFor: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["summary", "detectedStack", "whatToDoNext", "watchOutFor"],
        additionalProperties: false,
      },
    });

    return overviewSchema.parse(raw) satisfies StudentProjectOverview;
  } catch {
    return fallback;
  }
}

function buildFallbackOverview(artifacts: CollectedArtifact[]): StudentProjectOverview {
  const paths = artifacts.map((artifact) => artifact.path.toLowerCase());
  const detectedStack: string[] = [];
  const whatToDoNext: string[] = [];
  const watchOutFor: string[] = [];

  if (paths.some((path) => path.endsWith("package.json"))) {
    detectedStack.push("Node.js project");
  }

  if (paths.some((path) => path.endsWith("pnpm-lock.yaml"))) {
    detectedStack.push("pnpm package manager");
  } else if (paths.some((path) => path.endsWith("yarn.lock"))) {
    detectedStack.push("Yarn package manager");
  } else if (paths.some((path) => path.endsWith("package-lock.json"))) {
    detectedStack.push("npm package manager");
  }

  if (paths.some((path) => path.endsWith("requirements.txt") || path.endsWith("pyproject.toml"))) {
    detectedStack.push("Python project");
  }

  if (paths.some((path) => path.endsWith("readme.md") || path.endsWith("readme"))) {
    detectedStack.push("README documentation");
  } else {
    watchOutFor.push("The repository does not seem to include a clear README, which may make setup harder.");
  }

  if (detectedStack.length === 0) {
    detectedStack.push("General code project");
  }

  whatToDoNext.push("Run the DGX quick check to see whether the repository installs and starts cleanly.");
  whatToDoNext.push("Use the Gemma chat to ask what file is missing, how to improve setup, or what may break.");

  if (!paths.some((path) => path.endsWith("package.json") || path.endsWith("requirements.txt") || path.endsWith("pyproject.toml"))) {
    watchOutFor.push("No obvious dependency file was detected, so the runner may need manual setup commands.");
  }

  if (!paths.some((path) => path.includes("test"))) {
    watchOutFor.push("The repository does not show obvious test files, so validation may be limited.");
  }

  return {
    summary:
      "This project workspace is ready for review. The app detected the main files it can analyze and can now help you inspect the repository, run a DGX quick check, and identify missing setup steps.",
    detectedStack: detectedStack.slice(0, 5),
    whatToDoNext: whatToDoNext.slice(0, 4),
    watchOutFor: watchOutFor.slice(0, 4),
  };
}
