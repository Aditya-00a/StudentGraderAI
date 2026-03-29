import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import JSZip from "jszip";
import type { SandboxRuntime } from "@/lib/types";

const runtimeImages: Record<SandboxRuntime, string> = {
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
    const image = runtimeImages[plan.runtime];
    const commands = [shellPrefix];

    if (plan.setupCommand) {
      commands.push(plan.setupCommand);
    }

    commands.push(plan.runCommand);

    const result = await runDockerCommand({
      image,
      repoRoot,
      command: commands.join(" && "),
    });

    return {
      runtime: plan.runtime,
      setupCommand: plan.setupCommand,
      runCommand: plan.runCommand,
      ...result,
      summary: buildRunSummary(result.exitCode, plan.runtime),
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
    "User-Agent": "StudentGraderAI",
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

function runDockerCommand({
  image,
  repoRoot,
  command,
}: {
  image: string;
  repoRoot: string;
  command: string;
}) {
  return new Promise<{ logs: string; exitCode: number }>((resolve, reject) => {
    const args = [
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
      command,
    ];

    const child = spawn("docker", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let logs = "";
    const timeout = setTimeout(() => {
      logs += "\nSandbox timeout reached after 10 minutes.";
      child.kill("SIGTERM");
    }, 1000 * 60 * 10);

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
        logs: logs.trim().slice(0, 24_000),
        exitCode: code ?? 1,
      });
    });
  });
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
}) {
  const runtime = preferredRuntime ?? (await detectRuntime(repoRoot));
  const setupCommand = customSetupCommand?.trim() || (await detectSetupCommand(repoRoot, runtime));
  const runCommand = customRunCommand?.trim() || (await detectRunCommand(repoRoot, runtime));

  if (!runCommand) {
    throw new Error(
      "The DGX runner could not detect how to run this repository automatically. Open Advanced commands and add the project’s startup or test command.",
    );
  }

  return {
    runtime,
    setupCommand,
    runCommand,
  };
}

async function detectRuntime(repoRoot: string): Promise<SandboxRuntime> {
  if (await fileExists(path.join(repoRoot, "package.json"))) {
    return "node";
  }

  if (
    (await fileExists(path.join(repoRoot, "requirements.txt"))) ||
    (await fileExists(path.join(repoRoot, "pyproject.toml"))) ||
    (await fileExists(path.join(repoRoot, "app.py"))) ||
    (await fileExists(path.join(repoRoot, "main.py")))
  ) {
    return "python";
  }

  return "node";
}

async function detectSetupCommand(repoRoot: string, runtime: SandboxRuntime) {
  if (runtime === "node") {
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

async function detectRunCommand(repoRoot: string, runtime: SandboxRuntime) {
  if (runtime === "node") {
    const packageJson = await readPackageJson(repoRoot);
    const scripts = packageJson?.scripts ?? {};

    if (typeof scripts.build === "string") return "npm run build";
    if (typeof scripts.test === "string") return "npm test";
    if (typeof scripts.lint === "string") return "npm run lint";
    if (typeof scripts.start === "string") return "npm start";

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
    };
  } catch {
    return null;
  }
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

function buildRunSummary(exitCode: number, runtime: SandboxRuntime) {
  if (exitCode === 0) {
    return `The DGX sandbox finished the ${runtime} run successfully. Review the logs for details.`;
  }

  return `The DGX sandbox reported issues while running the ${runtime} project. Review the logs and fix the failing setup or run command.`;
}
