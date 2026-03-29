import { generateTextResponse, hasAiProviderConfigured } from "@/lib/ai-provider";
import { collectSubmissionArtifacts } from "@/lib/repository-intake";
import type { Submission, SubmissionChatMessage } from "@/lib/types";

export async function answerProjectQuestion({
  submission,
  question,
  history,
}: {
  submission: Submission;
  question: string;
  history: SubmissionChatMessage[];
}) {
  if (!hasAiProviderConfigured()) {
    throw new Error(
      "No AI provider is configured on the server. Set AI_PROVIDER=ollama with OLLAMA_MODEL, or configure Gemini with GEMINI_API_KEY.",
    );
  }

  const collected = await collectSubmissionArtifacts({
    githubUrl: submission.githubUrl,
    uploads: submission.files,
  });

  if (collected.artifacts.length === 0) {
    throw new Error(
      "No readable project files are available for chat yet. Upload files or provide a public GitHub repository first.",
    );
  }

  const evidence = collected.artifacts
    .slice(0, 24)
    .map(
      (artifact) =>
        `FILE: ${artifact.path}\nSOURCE: ${artifact.source}\n\n${artifact.content}\n\n---`,
    )
    .join("\n");

  const recentHistory = history
    .slice(-8)
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join("\n");

  return generateTextResponse({
    geminiModel: process.env.GEMINI_MODEL || "gemini-2.5-flash",
    ollamaModel: process.env.OLLAMA_MODEL || "gemma3:27b",
    temperature: 0.3,
    systemInstruction:
      "You are a practical project mentor inside a course sandbox. Answer only from the supplied project evidence and conversation. Be specific, concise, and honest when something is missing. Suggest concrete fixes, commands, or next steps. Never claim you ran code unless the run log says so.",
    prompt: [
      `Assignment: ${submission.assignmentTitle}`,
      `Student: ${submission.studentName} (${submission.studentEmail})`,
      `GitHub repository: ${submission.githubUrl ?? "Not provided"}`,
      submission.notes ? `Student notes: ${submission.notes}` : "Student notes: None",
      recentHistory ? `Recent chat:\n${recentHistory}` : "Recent chat: none",
      "",
      "Project evidence:",
      evidence,
      "",
      `Student question: ${question}`,
    ].join("\n"),
  });
}
