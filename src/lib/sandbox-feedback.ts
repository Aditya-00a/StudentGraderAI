import { generateTextResponse, hasAiProviderConfigured } from "@/lib/ai-provider";
import type { SandboxRuntime } from "@/lib/types";

export async function explainSandboxRunFailure({
  runtime,
  setupCommand,
  runCommand,
  logs,
}: {
  runtime: SandboxRuntime;
  setupCommand: string | null;
  runCommand: string;
  logs: string;
}) {
  const fallback = buildFallbackExplanation({ runtime, setupCommand, runCommand, logs });

  if (!hasAiProviderConfigured()) {
    return fallback;
  }

  try {
    const response = await generateTextResponse({
      geminiModel: process.env.GEMINI_MODEL || "gemini-2.5-flash",
      ollamaModel: process.env.OLLAMA_MODEL || "gemma3:27b",
      temperature: 0.2,
      systemInstruction:
        "You are helping a non-technical student understand why a sandbox run failed. Explain the likely issue in plain language, then suggest one or two concrete next steps. Keep it under 120 words and avoid jargon where possible.",
      prompt: [
        `Runtime: ${runtime}`,
        `Setup command: ${setupCommand ?? "Auto-detected"}`,
        `Run command: ${runCommand}`,
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
}: {
  runtime: SandboxRuntime;
  setupCommand: string | null;
  runCommand: string;
  logs: string;
}) {
  const lowerLogs = logs.toLowerCase();

  if (lowerLogs.includes("could not open requirements file")) {
    return "The DGX runner could not find a `requirements.txt` file, so the setup command is pointing to a file that does not exist. Try the quick check again, or open Advanced commands and remove that setup command if your project does not use it.";
  }

  if (lowerLogs.includes("npm err") || lowerLogs.includes("missing script")) {
    return "The project’s Node commands do not match what the DGX tried to run. Open Advanced commands and enter the exact script your repository actually uses, such as a different build, start, or test command.";
  }

  if (lowerLogs.includes("command not found")) {
    return `The DGX runner reached a command that does not exist in the ${runtime} project environment. Check the setup command \`${setupCommand ?? "auto-detect"}\` and run command \`${runCommand}\` and replace them with the exact commands from your project README.`;
  }

  return "The DGX runner found an issue while setting up or starting the project. Read the short logs below, then try the quick check again or open Advanced commands and enter the exact setup and run steps from your project README.";
}
