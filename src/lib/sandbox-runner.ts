import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import JSZip from "jszip";
import type { SandboxRuntime } from "@/lib/types";

type NodePackageManager = "npm" | "pnpm" | "yarn";

type RepositoryHints = {
  hasDockerfile: boolean;
  hasComposeFile: boolean;
  hasReadme: boolean;
  mentionsDgx: boolean;
  mentionsCuda: boolean;
  mentionsTorch: boolean;
  mentionsTransformers: boolean;
  packageManager: NodePackageManager;
};

type SandboxPlan = {
  runtime: SandboxRuntime;
  setupCommand: string | null;
  runCommand: string;
  architectureEvidence: string[];
  heavyDependencyWarning: boolean;
};

const runtimeImages: Record<Exclude<SandboxRuntime, "docker">, string> = {
  node: "node:22-bookworm-slim",
  python: "python:3.11-slim",
};

const shellPrefix =
  "set -e; if [ -f /etc/os-release ]; then . /etc/os-release >/dev/null 2>&1 || true; fi";

export async function runGithubProjectSandboxCheck({
  githubUrl,
  runtime,
  setupCommand,
  runCommand,
}: {
  githubUrl: string;
  runtime?: SandboxRuntime | null;
  setupCommand: string | null;
  runCommand?: string | null;
}) {
  const repo = parseGithubRepository(githubUrl);
  if (!repo) {
    throw new Error("Use a public GitHub repository URL for DGX sandbox runs.");
  }

  const workRoot = await mkdtemp(path.join(os.tmpdir(), "student-grader-run-"));
  const repoRoot = path.join(workRoot, "repo");

  try {
    await downloadGithubRepository(repo, repoRoot);
    const plan = await detectSandboxPlan({
      repoRoot,
      preferredRuntime: runtime ?? null,
      customSetupCommand: setupCommand,
      customRunCommand: runCommand,
    });

    const result =
      plan.runtime === "docker"
        ? await runDockerArchitectureCheck({
            repoRoot,
            runCommand: customDockerRunCommand(runCommand),
          })
        : await runPackageBasedCheck({
            repoRoot,
            runtime: plan.runtime,
            setupCommand: plan.setupCommand,
            runCommand: plan.runCommand,
          });

    return {
      runtime: plan.runtime,
      setupCommand: plan.setupCommand,
      runCommand: plan.runCommand,
      architectureEvidence: plan.architectureEvidence,
      heavyDependencyWarning: plan.heavyDependencyWarning,
      ...result,
      summary: buildRunSummary({
        exitCode: result.exitCode,
        runtime: plan.runtime,
        architectureEvidence: plan.architectureEvidence,
        heavyDependencyWarning: plan.heavyDependencyWarning,
      }),
    };
  } finally {
    await rm(workRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function downloadGithubRepository(
  repo: { owner: string; repo: string; branch: string | null },
  targetDirectory: string,
) {
  const headers = new Headers({
    Accept: "application/vnd.github+json",
    "User-Agent": "NYU-SPS-SANDBOX",
  });

  if (process.env.GITHUB_TOKEN) {
    headers.set("Authorization", `Bearer ${process.env.GITHUB_TOKEN}`);
  }

  const repositoryResponse = await fetch(
    `https://api.github.com/repos/${repo.owner}/${repo.repo}`,
    {
      headers,
      cache: "no-store",
    },
  );

  if (!repositoryResponse.ok) {
    throw new Error("The GitHub repository could not be loaded. Make sure it is public.");
  }

  const repository = (await repositoryResponse.json()) as { default_branch?: string };
  const branch = repo.branch ?? repository.default_branch ?? "main";
  const encodedBranch = branch.split("/").map(encodeURIComponent).join("/");
  const zipResponse = await fetch(
    `https://codeload.github.com/${repo.owner}/${repo.repo}/zip/refs/heads/${encodedBranch}`,
    {
      headers,
      cache: "no-store",
    },
  );

  if (!zipResponse.ok) {
    throw new Error("The GitHub repository archive could not be downloaded.");
  }

  const zipBuffer = Buffer.from(await zipResponse.arrayBuffer());
  const zip = await JSZip.loadAsync(zipBuffer);

  await Promise.all(
    Object.values(zip.files).map(async (entry) => {
      if (entry.dir) {
        return;
      }

      const relativePath = trimArchiveRoot(entry.name);
      if (!relativePath) {
        return;
      }

      const destination = path.join(targetDirectory, relativePath);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, await entry.async("nodebuffer"));
    }),
  );
}

async function runPackageBasedCheck({
  repoRoot,
  runtime,
  setupCommand,
  runCommand,
}: {
  repoRoot: string;
  runtime: Exclude<SandboxRuntime, "docker">;
  setupCommand: string | null;
  runCommand: string;
}) {
  const image = runtimeImages[runtime];
  const commands = [shellPrefix];

  if (setupCommand) {
    commands.push(setupCommand);
  }

  commands.push(runCommand);

  return runDockerCommand({
    args: [
      "run",
      "--rm",
      "--cpus",
      "4",
      "--memory",
      "8g",
      "-v",
      `${repoRoot}:/workspace`,
      "-w",
      "/workspace",
      image,
      "bash",
      "-lc",
      commands.join(" && "),
    ],
    timeoutMs: 1000 * 60 * 10,
  });
}

async function runDockerArchitectureCheck({
  repoRoot,
  runCommand,
}: {
  repoRoot: string;
  runCommand: string | null;
}) {
  const tag = `nyu-sps-sandbox-${crypto.randomUUID().slice(0, 12)}`;
  const buildResult = await runDockerCommand({
    args: ["build", "-t", tag, repoRoot],
    timeoutMs: 1000 * 60 * 15,
  });

  if (buildResult.exitCode !== 0) {
    await removeDockerImage(tag);
    return {
      logs: buildResult.logs,
      exitCode: buildResult.exitCode,
    };
  }

  const runArgs = [
    "run",
    "--rm",
    "--cpus",
    "4",
    "--memory",
    "12g",
    tag,
  ];

  if (runCommand) {
    runArgs.push("sh", "-lc", runCommand);
  }

  const runResult = await runDockerCommand({
    args: runArgs,
    timeoutMs: 1000 * 60 * 12,
  });

  await removeDockerImage(tag);

  return {
    logs: [buildResult.logs, "", runResult.logs].filter(Boolean).join("\n").trim(),
    exitCode: runResult.exitCode,
  };
}

function runDockerCommand({
  args,
  timeoutMs,
}: {
  args: string[];
  timeoutMs: number;
}) {
  return new Promise<{ logs: string; exitCode: number }>((resolve, reject) => {
    const child = spawn("docker", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let logs = "";
    const timeout = setTimeout(() => {
      logs += `\nSandbox timeout reached after ${Math.round(timeoutMs / 60000)} minutes.`;
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      logs += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      logs += chunk.toString();
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve({
        logs: logs.trim().slice(0, 32_000),
        exitCode: code ?? 1,
      });
    });
  });
}

async function removeDockerImage(tag: string) {
  await runDockerCommand({
    args: ["image", "rm", "-f", tag],
    timeoutMs: 1000 * 60,
  }).catch(() => undefined);
}

function defaultPythonSetup(repoRoot: string) {
  const requirementsPath = path.join(repoRoot, "requirements.txt");
  const pyprojectPath = path.join(repoRoot, "pyproject.toml");
  return `python -m pip install --upgrade pip && if [ -f "${requirementsPath}" ]; then pip install -r requirements.txt; elif [ -f "${pyprojectPath}" ]; then pip install .; else echo "No requirements.txt or pyproject.toml found, skipping dependency install."; fi`;
}

async function detectSandboxPlan({
  repoRoot,
  preferredRuntime,
  customSetupCommand,
  customRunCommand,
}: {
  repoRoot: string;
  preferredRuntime: SandboxRuntime | null;
  customSetupCommand: string | null;
  customRunCommand: string | null | undefined;
}): Promise<SandboxPlan> {
  const hints = await collectRepositoryHints(repoRoot);
  const runtime = preferredRuntime ?? (await detectRuntime(repoRoot, hints));
  const architectureEvidence = buildArchitectureEvidence(hints);
  const heavyDependencyWarning = hints.mentionsTorch || hints.mentionsTransformers;
  const setupCommand = customSetupCommand?.trim() || (await detectSetupCommand(repoRoot, runtime, hints));
  const runCommand = customRunCommand?.trim() || (await detectRunCommand(repoRoot, runtime, hints));

  if (!runCommand) {
    if (runtime === "docker") {
      return {
        runtime,
        setupCommand,
        runCommand: "Container default command",
        architectureEvidence,
        heavyDependencyWarning,
      };
    }

    throw new Error(
      "The DGX runner could not detect how to run this repository automatically. Open Advanced commands and add the project’s startup or test command.",
    );
  }

  return {
    runtime,
    setupCommand,
    runCommand,
    architectureEvidence,
    heavyDependencyWarning,
  };
}

async function collectRepositoryHints(repoRoot: string): Promise<RepositoryHints> {
  const hasDockerfile =
    (await fileExists(path.join(repoRoot, "Dockerfile"))) ||
    (await fileExists(path.join(repoRoot, "docker", "Dockerfile")));
  const hasComposeFile =
    (await fileExists(path.join(repoRoot, "docker-compose.yml"))) ||
    (await fileExists(path.join(repoRoot, "docker-compose.yaml"))) ||
    (await fileExists(path.join(repoRoot, "compose.yml"))) ||
    (await fileExists(path.join(repoRoot, "compose.yaml")));
  const readmePath =
    (await fileExists(path.join(repoRoot, "README.md")))
      ? path.join(repoRoot, "README.md")
      : (await fileExists(path.join(repoRoot, "README")))
        ? path.join(repoRoot, "README")
        : null;
  const readme = readmePath ? (await readFile(readmePath, "utf8").catch(() => "")) : "";
  const requirements = await readDependencyFile(repoRoot, "requirements.txt");
  const pyproject = await readDependencyFile(repoRoot, "pyproject.toml");
  const packageJson = await readPackageJson(repoRoot);
  const packageText = packageJson ? JSON.stringify(packageJson).toLowerCase() : "";
  const combinedText = `${readme}\n${requirements}\n${pyproject}\n${packageText}`.toLowerCase();

  return {
    hasDockerfile,
    hasComposeFile,
    hasReadme: Boolean(readmePath),
    mentionsDgx: combinedText.includes("dgx"),
    mentionsCuda: combinedText.includes("cuda") || combinedText.includes("nvidia"),
    mentionsTorch: combinedText.includes("torch"),
    mentionsTransformers: combinedText.includes("transformers"),
    packageManager: await detectNodePackageManager(repoRoot),
  };
}

function buildArchitectureEvidence(hints: RepositoryHints) {
  const evidence: string[] = [];

  if (hints.hasDockerfile) {
    evidence.push("Dockerfile for containerized deployment");
  }

  if (hints.hasComposeFile) {
    evidence.push("docker-compose or compose configuration");
  }

  if (hints.mentionsDgx) {
    evidence.push("README or config mentions DGX deployment");
  }

  if (hints.mentionsCuda) {
    evidence.push("CUDA or NVIDIA configuration detected");
  }

  if (hints.mentionsTorch || hints.mentionsTransformers) {
    evidence.push("LLM or deep learning dependencies detected");
  }

  return evidence;
}

async function detectRuntime(
  repoRoot: string,
  hints: RepositoryHints,
): Promise<SandboxRuntime> {
  if (hints.hasDockerfile) {
    return "docker";
  }

  if (await fileExists(path.join(repoRoot, "package.json"))) {
    return "node";
  }

  if (
    (await fileExists(path.join(repoRoot, "requirements.txt"))) ||
    (await fileExists(path.join(repoRoot, "pyproject.toml"))) ||
    (await fileExists(path.join(repoRoot, "app.py"))) ||
    (await fileExists(path.join(repoRoot, "main.py"))) ||
    hints.hasComposeFile
  ) {
    return "python";
  }

  return "node";
}

async function detectSetupCommand(
  repoRoot: string,
  runtime: SandboxRuntime,
  hints: RepositoryHints,
) {
  if (runtime === "docker") {
    return hints.hasDockerfile ? "docker build using repository Dockerfile" : null;
  }

  if (runtime === "node") {
    const packageManager = hints.packageManager;

    if (packageManager === "pnpm") {
      return "corepack enable && pnpm install";
    }

    if (packageManager === "yarn") {
      return "corepack enable && yarn install";
    }

    if (await fileExists(path.join(repoRoot, "package-lock.json"))) {
      return "npm ci";
    }

    if (await fileExists(path.join(repoRoot, "package.json"))) {
      return "npm install";
    }

    return null;
  }

  return defaultPythonSetup(repoRoot);
}

async function detectRunCommand(
  repoRoot: string,
  runtime: SandboxRuntime,
  hints: RepositoryHints,
) {
  if (runtime === "docker") {
    return "Container default command";
  }

  if (runtime === "node") {
    const packageJson = await readPackageJson(repoRoot);
    const scripts = packageJson?.scripts ?? {};
    const runner = getNodeRunPrefix(hints.packageManager);

    if (typeof scripts.build === "string") return `${runner} build`;
    if (typeof scripts.test === "string") return hints.packageManager === "npm" ? "npm test" : `${runner} test`;
    if (typeof scripts.lint === "string") return `${runner} lint`;
    if (typeof scripts.start === "string") return hints.packageManager === "npm" ? "npm start" : `${runner} start`;

    return null;
  }

  if (await fileExists(path.join(repoRoot, "pytest.ini")) || (await directoryExists(path.join(repoRoot, "tests")))) {
    return "pytest";
  }

  if (await fileExists(path.join(repoRoot, "app.py"))) {
    return "python app.py";
  }

  if (await fileExists(path.join(repoRoot, "main.py"))) {
    return "python main.py";
  }

  if (hints.hasComposeFile) {
    return "python app.py";
  }

  return null;
}

async function readPackageJson(repoRoot: string) {
  const packageJsonPath = path.join(repoRoot, "package.json");

  if (!(await fileExists(packageJsonPath))) {
    return null;
  }

  try {
    return JSON.parse(await readFile(packageJsonPath, "utf8")) as {
      scripts?: Record<string, string>;
      packageManager?: string;
    };
  } catch {
    return null;
  }
}

async function readDependencyFile(repoRoot: string, fileName: string) {
  const filePath = path.join(repoRoot, fileName);

  if (!(await fileExists(filePath))) {
    return "";
  }

  return readFile(filePath, "utf8").catch(() => "");
}

async function detectNodePackageManager(repoRoot: string): Promise<NodePackageManager> {
  if (await fileExists(path.join(repoRoot, "pnpm-lock.yaml"))) {
    return "pnpm";
  }

  if (await fileExists(path.join(repoRoot, "yarn.lock"))) {
    return "yarn";
  }

  const packageJson = await readPackageJson(repoRoot);
  const declaredManager = packageJson?.packageManager;

  if (typeof declaredManager === "string") {
    if (declaredManager.startsWith("pnpm@")) {
      return "pnpm";
    }

    if (declaredManager.startsWith("yarn@")) {
      return "yarn";
    }
  }

  return "npm";
}

function getNodeRunPrefix(packageManager: NodePackageManager) {
  if (packageManager === "pnpm") {
    return "corepack enable && pnpm";
  }

  if (packageManager === "yarn") {
    return "corepack enable && yarn";
  }

  return "npm run";
}

function customDockerRunCommand(runCommand: string | null | undefined) {
  const trimmed = runCommand?.trim();
  if (!trimmed || trimmed === "Container default command" || trimmed === "Auto-detect") {
    return null;
  }

  return trimmed;
}

async function fileExists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function directoryExists(directoryPath: string) {
  try {
    await access(directoryPath);
    return true;
  } catch {
    return false;
  }
}

function parseGithubRepository(githubUrl: string) {
  try {
    const url = new URL(githubUrl);
    if (url.hostname !== "github.com") {
      return null;
    }

    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length < 2) {
      return null;
    }

    return {
      owner: segments[0],
      repo: segments[1].replace(/\.git$/, ""),
      branch:
        segments[2] === "tree" && segments.length > 3
          ? decodeURIComponent(segments.slice(3).join("/"))
          : null,
    };
  } catch {
    return null;
  }
}

function trimArchiveRoot(filePath: string) {
  const segments = filePath.split("/").filter(Boolean);
  return segments.length > 1 ? segments.slice(1).join("/") : "";
}

function buildRunSummary({
  exitCode,
  runtime,
  architectureEvidence,
  heavyDependencyWarning,
}: {
  exitCode: number;
  runtime: SandboxRuntime;
  architectureEvidence: string[];
  heavyDependencyWarning: boolean;
}) {
  if (exitCode === 0) {
    if (runtime === "docker") {
      return "The DGX sandbox built and ran the repository container successfully.";
    }

    return `The DGX sandbox finished the ${runtime} run successfully. Review the logs for details.`;
  }

  if (architectureEvidence.length > 0) {
    const evidence = architectureEvidence.slice(0, 3).join(", ");
    if (heavyDependencyWarning) {
      return `The automated DGX quick check hit setup or runtime limits, but the repository still shows DGX-ready deployment evidence: ${evidence}.`;
    }

    return `The automated DGX quick check found issues, but the repository still shows deployment evidence that supports DGX portability: ${evidence}.`;
  }

  return `The DGX sandbox reported issues while running the ${runtime} project. Review the logs and fix the failing setup or run command.`;
}
