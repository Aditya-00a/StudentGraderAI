import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import type { Assignment, CollectedArtifact, GradingResult, Submission } from "@/lib/types";

const gradingResponseSchema = z.object({
  score: z.number(),
  gradingSummary: z.string().min(20).max(1_200),
  strengths: z.array(z.string().min(6).max(280)).min(2).max(5),
  improvements: z.array(z.string().min(6).max(280)).min(2).max(5),
  rubricBreakdown: z
    .array(
      z.object({
        criterion: z.string().min(2).max(80),
        score: z.number(),
        feedback: z.string().min(8).max(300),
      }),
    )
    .min(2)
    .max(6),
  professorFeedback: z.string().min(20).max(1_500),
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
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is missing. Add it to .env.local to enable AI grading.");
  }

  if (artifacts.length === 0) {
    throw new Error(
      "No readable source files were found. Upload code files, a zip archive, or a public GitHub repository.",
    );
  }

  const client = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
  });

  const evidenceBlock = artifacts
    .map(
      (artifact) =>
        `FILE: ${artifact.path}\nSOURCE: ${artifact.source}\n\n${artifact.content}\n\n---`,
    )
    .join("\n");

  const response = await client.models.generateContent({
    model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
    contents: [
      `Assignment title: ${assignment.title}`,
      `Course: ${assignment.courseCode}`,
      `Maximum score: ${assignment.maxScore} ${assignment.ratingLabel}`,
      `Grading focus: ${assignment.gradingFocus}`,
      `Rubric: ${assignment.rubric}`,
      `Student: ${submission.studentName} (${submission.studentEmail})`,
      `Submission notes: ${submission.notes ?? "None provided"}`,
      `GitHub repository: ${githubRepositoryLabel ?? submission.githubUrl ?? "Not provided"}`,
      "Return a rigorous grade with concrete evidence. The rubric breakdown scores must stay within the assignment scale and should add up roughly to the final score without exceeding the maximum.",
      "",
      "Assignment brief:",
      assignment.description,
      "",
      "Submission evidence:",
      evidenceBlock,
    ].join("\n"),
    config: {
      systemInstruction:
        "You are a fair but demanding professor assistant. Grade only from the provided evidence. Never invent features that are not present. If the repository is incomplete, say that clearly and score conservatively. Feedback should be specific, constructive, and written in plain language a student can act on.",
      responseMimeType: "application/json",
      responseJsonSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          score: {
            type: "number",
            minimum: 0,
            maximum: assignment.maxScore,
          },
          gradingSummary: { type: "string" },
          strengths: {
            type: "array",
            items: { type: "string" },
            minItems: 2,
            maxItems: 5,
          },
          improvements: {
            type: "array",
            items: { type: "string" },
            minItems: 2,
            maxItems: 5,
          },
          rubricBreakdown: {
            type: "array",
            minItems: 2,
            maxItems: 6,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                criterion: { type: "string" },
                score: {
                  type: "number",
                  minimum: 0,
                  maximum: assignment.maxScore,
                },
                feedback: { type: "string" },
              },
              required: ["criterion", "score", "feedback"],
            },
          },
          professorFeedback: { type: "string" },
        },
        required: [
          "score",
          "gradingSummary",
          "strengths",
          "improvements",
          "rubricBreakdown",
          "professorFeedback",
        ],
      },
    },
  });

  if (!response.text) {
    throw new Error("The Gemini grader returned an empty response.");
  }

  const parsed = gradingResponseSchema.parse(JSON.parse(response.text));

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

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}
