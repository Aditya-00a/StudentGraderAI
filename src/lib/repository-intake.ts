import { mkdir, readFile, writeFile } from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import JSZip from "jszip";
import {
  hasBlobStorageConfigured,
  readPrivateBlobBuffer,
  writePrivateBlob,
} from "@/lib/blob-storage";
import {
  hasSupabaseStorageConfigured,
  readSupabaseBuffer,
  writeSupabaseFile,
} from "@/lib/supabase-storage";
import { storageRoot } from "@/lib/paths";
import type { ArtifactPreview, CollectedArtifact, StoredUpload } from "@/lib/types";
import { slugifySegment } from "@/lib/utils";
const maxFilesToAnalyze = 80;
const maxCharsPerFile = 5_000;
const maxCharsOverall = 90_000;

const ignoredSegments = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  "coverage",
  "vendor",
  "bin",
]);

const textExtensions = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
  ".txt",
  ".html",
  ".css",
  ".scss",
  ".sass",
  ".less",
  ".py",
  ".java",
  ".kt",
  ".go",
  ".rs",
  ".php",
  ".rb",
  ".cs",
  ".cpp",
  ".c",
  ".h",
  ".swift",
  ".sql",
  ".sh",
  ".ps1",
  ".xml",
  ".yml",
  ".yaml",
  ".toml",
  ".ini",
  ".env",
]);

const textBasenames = new Set([
  "Dockerfile",
  "Makefile",
  "Procfile",
  "README",
  "README.md",
  ".gitignore",
]);

export async function persistUploadedFiles(submissionId: string, files: File[]) {
  if (files.length === 0) {
    return [] satisfies StoredUpload[];
  }

  if (hasSupabaseStorageConfigured()) {
    const uploads: StoredUpload[] = [];

    for (const file of files) {
      const extension = path.extname(file.name);
      const baseName = path.basename(file.name, extension);
      const safeFileName = `${slugifySegment(baseName) || "file"}${extension.toLowerCase()}`;
      const relativePath = `submissions/${submissionId}/${crypto.randomUUID()}-${safeFileName}`;
      const buffer = Buffer.from(await file.arrayBuffer());

      await writeSupabaseFile(relativePath, buffer, file.type || "application/octet-stream");

      uploads.push({
        originalName: file.name,
        savedPath: relativePath,
        size: file.size,
      });
    }

    return uploads;
  }

  if (hasBlobStorageConfigured()) {
    const uploads: StoredUpload[] = [];

    for (const file of files) {
      const extension = path.extname(file.name);
      const baseName = path.basename(file.name, extension);
      const safeFileName = `${slugifySegment(baseName) || "file"}${extension.toLowerCase()}`;
      const relativePath = `submissions/${submissionId}/${crypto.randomUUID()}-${safeFileName}`;
      const buffer = Buffer.from(await file.arrayBuffer());

      await writePrivateBlob(relativePath, buffer);

      uploads.push({
        originalName: file.name,
        savedPath: relativePath,
        size: file.size,
      });
    }

    return uploads;
  }

  const targetDirectory = path.join(storageRoot, submissionId);
  await mkdir(targetDirectory, { recursive: true });

  const uploads: StoredUpload[] = [];

  for (const file of files) {
    const extension = path.extname(file.name);
    const baseName = path.basename(file.name, extension);
    const safeFileName = `${slugifySegment(baseName) || "file"}${extension.toLowerCase()}`;
    const relativePath = path.join(submissionId, `${crypto.randomUUID()}-${safeFileName}`);
    const fullPath = path.join(storageRoot, relativePath);
    const buffer = Buffer.from(await file.arrayBuffer());

    await writeFile(fullPath, buffer);

    uploads.push({
      originalName: file.name,
      savedPath: relativePath,
      size: file.size,
    });
  }

  return uploads;
}

export async function collectSubmissionArtifacts({
  uploads,
  githubUrl,
}: {
  uploads: StoredUpload[];
  githubUrl: string | null;
}) {
  const uploadArtifacts = await collectArtifactsFromUploads(uploads);
  const githubResult = githubUrl ? await collectArtifactsFromGithub(githubUrl) : null;
  const artifacts = trimArtifacts([
    ...uploadArtifacts,
    ...(githubResult?.artifacts ?? []),
  ]);

  const previewFiles: ArtifactPreview[] = artifacts.map((artifact) => ({
    path: artifact.path,
    source: artifact.source,
    charCount: artifact.content.length,
  }));

  return {
    artifacts,
    previewFiles,
    githubRepositoryLabel: githubResult?.label ?? null,
  };
}

async function collectArtifactsFromUploads(uploads: StoredUpload[]) {
  const artifacts: CollectedArtifact[] = [];

  for (const upload of uploads) {
    const buffer = hasSupabaseStorageConfigured()
      ? await readSupabaseBuffer(upload.savedPath)
      : hasBlobStorageConfigured()
        ? await readPrivateBlobBuffer(upload.savedPath)
        : await readFile(path.join(storageRoot, upload.savedPath));

    if (!buffer) {
      continue;
    }

    const extension = path.extname(upload.originalName).toLowerCase();

    if (extension === ".zip") {
      const nested = await collectArtifactsFromZipBuffer(buffer, "upload");
      artifacts.push(...nested);
      continue;
    }

    const content = decodeBuffer(buffer);
    if (!content || !isTextLikePath(upload.originalName)) {
      continue;
    }

    artifacts.push({
      path: upload.originalName,
      source: "upload",
      content,
    });
  }

  return artifacts;
}

async function collectArtifactsFromGithub(githubUrl: string) {
  const parsed = parseGithubRepository(githubUrl);
  if (!parsed) {
    throw new Error("The GitHub URL could not be parsed. Use a public repository URL.");
  }

  const headers = new Headers({
    Accept: "application/vnd.github+json",
    "User-Agent": "NYU-SPS-SANDBOX",
  });

  if (process.env.GITHUB_TOKEN) {
    headers.set("Authorization", `Bearer ${process.env.GITHUB_TOKEN}`);
  }

  const repositoryResponse = await fetch(
    `https://api.github.com/repos/${parsed.owner}/${parsed.repo}`,
    {
      headers,
      cache: "no-store",
    },
  );

  if (!repositoryResponse.ok) {
    throw new Error("The GitHub repository could not be loaded. Make sure it is public.");
  }

  const repository = (await repositoryResponse.json()) as { default_branch?: string };
  const branch = parsed.branch ?? repository.default_branch ?? "main";
  const encodedBranch = branch.split("/").map(encodeURIComponent).join("/");
  const zipResponse = await fetch(
    `https://codeload.github.com/${parsed.owner}/${parsed.repo}/zip/refs/heads/${encodedBranch}`,
    {
      headers,
      cache: "no-store",
    },
  );

  if (!zipResponse.ok) {
    throw new Error("The GitHub repository archive could not be downloaded.");
  }

  const zipBuffer = Buffer.from(await zipResponse.arrayBuffer());
  const artifacts = await collectArtifactsFromZipBuffer(zipBuffer, "github");

  return {
    label: `${parsed.owner}/${parsed.repo}@${branch}`,
    artifacts,
  };
}

async function collectArtifactsFromZipBuffer(buffer: Buffer, source: "upload" | "github") {
  const zip = await JSZip.loadAsync(buffer);
  const artifacts: CollectedArtifact[] = [];

  await Promise.all(
    Object.values(zip.files).map(async (entry) => {
      if (entry.dir || shouldSkipPath(entry.name) || !isTextLikePath(entry.name)) {
        return;
      }

      const entryBuffer = await entry.async("nodebuffer");
      const content = decodeBuffer(entryBuffer);

      if (!content) {
        return;
      }

      artifacts.push({
        path: trimArchiveRoot(entry.name),
        source,
        content,
      });
    }),
  );

  return artifacts;
}

function trimArtifacts(artifacts: CollectedArtifact[]) {
  const selected: CollectedArtifact[] = [];
  let totalChars = 0;

  for (const artifact of artifacts) {
    if (selected.length >= maxFilesToAnalyze || totalChars >= maxCharsOverall) {
      break;
    }

    const cleaned = artifact.content.trim();
    if (cleaned.length < 20) {
      continue;
    }

    const remainingBudget = maxCharsOverall - totalChars;
    const content = cleaned.slice(0, Math.min(maxCharsPerFile, remainingBudget));

    selected.push({
      ...artifact,
      content,
    });

    totalChars += content.length;
  }

  return selected;
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

function shouldSkipPath(filePath: string) {
  const segments = filePath.split("/").filter(Boolean);
  return segments.some((segment) => ignoredSegments.has(segment));
}

function trimArchiveRoot(filePath: string) {
  const segments = filePath.split("/").filter(Boolean);
  return segments.length > 1 ? segments.slice(1).join("/") : filePath;
}

function isTextLikePath(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  const basename = path.basename(filePath);
  return textExtensions.has(extension) || textBasenames.has(basename);
}

function decodeBuffer(buffer: Buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 1_024));
  const nullByteCount = sample.filter((byte) => byte === 0).length;

  if (nullByteCount > sample.length * 0.05) {
    return null;
  }

  return buffer
    .toString("utf8")
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n");
}
