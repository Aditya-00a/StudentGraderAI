import { z } from "zod";
import {
  generateStructuredObject,
  getAiProviderName,
  hasAiProviderConfigured,
} from "@/lib/ai-provider";

const rubricSuggestionSchema = z.object({
  gradingFocus: z.string().min(12).max(1200),
  rubric: z.string().min(40).max(5000),
});

export async function generateRubricSuggestion(input: {
  title: string;
  courseCode: string;
  description: string;
  maxScore: number;
}) {
  if (!hasAiProviderConfigured()) {
    return buildFallbackRubric(input);
  }

  try {
    const raw = await generateStructuredObject({
      geminiModel: process.env.GEMINI_MODEL || "gemini-2.5-flash",
      ollamaModel: process.env.OLLAMA_MODEL || "qwen2.5-coder:7b",
      prompt: [
        `Assignment title: ${input.title}`,
        `Course or module: ${input.courseCode}`,
        `Maximum score: ${input.maxScore}`,
        "",
        "Assignment description:",
        input.description,
        "",
        "Generate a grading focus and a professor-editable rubric.",
        "The rubric should be practical, fair, and written so a professor can use it directly.",
        `Use a total scale of ${input.maxScore}.`,
        "Return plain language with criterion names, suggested points, and what strong work should demonstrate.",
      ].join("\n"),
      systemInstruction:
        "You help professors create clear grading rubrics. Be concise, concrete, and classroom-friendly.",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          gradingFocus: { type: "string" },
          rubric: { type: "string" },
        },
        required: ["gradingFocus", "rubric"],
      },
    });

    return rubricSuggestionSchema.parse(raw);
  } catch {
    return buildFallbackRubric(input);
  }
}

function buildFallbackRubric(input: {
  title: string;
  courseCode: string;
  description: string;
  maxScore: number;
}) {
  const quarter = Math.max(1, Math.round(input.maxScore * 0.25));
  const third = Math.max(1, Math.round(input.maxScore * 0.3));
  const remaining = Math.max(1, input.maxScore - quarter - third - quarter);

  return {
    gradingFocus:
      "Evaluate how well the submission meets the assignment requirements, the quality of the implementation, clarity of explanation, and overall completeness." +
      (getAiProviderName() === "ollama" ? " Use conservative scoring if the local model is uncertain." : ""),
    rubric: [
      `${input.title} (${input.courseCode}) suggested rubric`,
      "",
      `1. Requirement coverage and completeness - ${third} points`,
      "Assess whether the project satisfies the main requested features and addresses the assignment goals.",
      "",
      `2. Code quality and technical execution - ${quarter} points`,
      "Assess structure, readability, maintainability, correctness, and technical choices.",
      "",
      `3. Documentation and communication - ${quarter} points`,
      "Assess README quality, setup clarity, explanation of design decisions, and how clearly the work is presented.",
      "",
      `4. Testing, polish, and reliability - ${remaining} points`,
      "Assess validation, testing evidence, stability, and finishing quality.",
      "",
      "Assignment summary:",
      input.description,
    ].join("\n"),
  };
}
