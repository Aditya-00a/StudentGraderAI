import { generateTextResponse, hasAiProviderConfigured } from "@/lib/ai-provider";
import type { SandboxRuntime } from "@/lib/types";

export async function explainSandboxRunFailure({
  runtime,
  setupCommand,
  runCommand,
  logs,
  architectureEvidence,
  heavyDependencyWarning,
}: {
  runtime: SandboxRuntime;
  setupCommand: string | null;
  runCommand: string;
  logs: string;
  architectureEvidence: string[];
  heavyDependencyWarning: boolean;
}) {
  const fallback = buildFallbackExplanation({
    runtime,
    setupCommand,
    runCommand,
    logs,
    architectureEvidence,
    heavyDependencyWarning,
  });

  if (!hasAiProviderConfigured()) {
    return fallback;
  }

  try {
    const response = await generateTextResponse({
      geminiModel: process.env.GEMINI_MODEL || "gemini-2.5-flash",
      ollamaModel: process.env.OLLAMA_MODEL || "gemma3:27b",
      temperature: 0.2,
      systemInstruction:
        "You are helping a non-technical student understand why a sandbox run failed. Explain the likely issue in plain language, mention any signs that the repository still looks deployable, and suggest one or two concrete next steps. Keep it under 120 words and avoid jargon where possible.",
      prompt: [
        `Runtime: ${runtime}`,
        `Setup command: ${setupCommand ?? "Auto-detected"}`,
        `Run command: ${runCommand}`,
        `Architecture evidence: ${architectureEvidence.length > 0 ? architectureEvidence.join(", ") : "None detected"}`,
        `Heavy ML dependencies detected: ${heavyDependencyWarning ? "yes" : "no"}`,
        "Sandbox logs:",
        logs.slice(0, 6_000),
      ].join("\n"),
    });

    return response.trim() || fallback;
  } catch {
    return fallback;
  }
}

function buildFallbackExplanation({
  runtime,
  setupCommand,
  runCommand,
  logs,
  architectureEvidence,
  heavyDependencyWarning,
}: {
  runtime: SandboxRuntime;
  setupCommand: string | null;
  runCommand: string;
  logs: string;
  architectureEvidence: string[];
  heavyDependencyWarning: boolean;
}) {
  const lowerLogs = logs.toLowerCase();

  if (
    heavyDependencyWarning &&
    (lowerLogs.includes("no space left on device") ||
      lowerLogs.includes("killed") ||
      lowerLogs.includes("out of memory") ||
      lowerLogs.includes("too large") ||
      lowerLogs.includes("timed out") ||
      lowerLogs.includes("timeout"))
  ) {
    return architectureEvidence.length > 0
      ? `The DGX quick check likely ran into dependency size or runtime limits while setting up a large AI stack. That does not automatically mean the project is not portable. The repository still shows DGX-ready evidence such as ${architectureEvidence.slice(0, 3).join(", ")}.`
      : "The DGX quick check likely ran into dependency size or runtime limits while setting up a large AI stack. Try using the project's own Docker setup or a narrower startup command if the repository is heavier than a normal classroom project.";
  }

  if (lowerLogs.includes("could not open requirements file")) {
    return "The DGX runner could not find a `requirements.txt` file, so the setup command is pointing to a file that does not exist. Try the quick check again, or open Advanced commands and remove that setup command if your project does not use it.";
  }

  if (
    (lowerLogs.includes("torch") || lowerLogs.includes("transformers")) &&
    architectureEvidence.length > 0
  ) {
    return `The project looks like a real DGX-style AI repository, but the automated quick check hit issues while installing large ML dependencies. The sandbox still detected deployment evidence such as ${architectureEvidence.slice(0, 3).join(", ")}.`;
  }

  if (lowerLogs.includes("failed to solve") || lowerLogs.includes("docker build")) {
    return architectureEvidence.length > 0
      ? `The sandbox recognized this as a container-based project, but the repository Docker build did not complete cleanly. The project still shows DGX-ready evidence such as ${architectureEvidence.slice(0, 3).join(", ")}.`
      : "The sandbox tried to use the repository's container setup, but the Docker build or startup command failed. Check the Dockerfile and any image build steps in the repository.";
  }

  if (lowerLogs.includes("npm err") || lowerLogs.includes("missing script")) {
    return "The project's Node commands do not match what the DGX tried to run. Open Advanced commands and enter the exact script your repository actually uses, such as a different build, start, or test command.";
  }

  if (lowerLogs.includes("command not found")) {
    return `The DGX runner reached a command that does not exist in the ${runtime} project environment. Check the setup command \`${setupCommand ?? "auto-detect"}\` and run command \`${runCommand}\` and replace them with the exact commands from your project README.`;
  }

  if (architectureEvidence.length > 0) {
    return `The automated quick check found a setup or startup issue, but the repository still shows signs that it was designed for DGX or container deployment: ${architectureEvidence.slice(0, 3).join(", ")}.`;
  }

  return "The DGX runner found an issue while setting up or starting the project. Read the short logs below, then try the quick check again or open Advanced commands and enter the exact setup and run steps from your project README.";
}
