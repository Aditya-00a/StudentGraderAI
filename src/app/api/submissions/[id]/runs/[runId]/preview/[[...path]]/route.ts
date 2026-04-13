import { NextResponse } from "next/server";
import { getCurrentUserFromCookieHeader, isLocalAuthEnabled } from "@/lib/auth";
import { stopSandboxPreview } from "@/lib/sandbox-runner";
import { getSubmissionById } from "@/lib/store";

export const runtime = "nodejs";

function buildPreviewBasePath(id: string, runId: string) {
  return `/api/submissions/${id}/runs/${runId}/preview`;
}

function prefixRootRelativePath(value: string, previewBasePath: string) {
  if (!value.startsWith("/") || value.startsWith("//")) {
    return value;
  }

  if (value.startsWith(previewBasePath)) {
    return value;
  }

  return `${previewBasePath}${value}`;
}

function rewritePreviewHtml(html: string, previewBasePath: string) {
  return html
    .replace(
      /(?<=\b(?:href|src|action|poster|data-href|data-src)=["'])\/(?!\/)/g,
      `${previewBasePath}/`,
    )
    .replace(/(?<=url\(["']?)\/(?!\/)/g, `${previewBasePath}/`)
    .replace(/(?<=["'])\/(?!\/)(?=(?:_next|assets|static|favicon|manifest|robots|sitemap))/g, `${previewBasePath}/`)
    .replace(/(?<=\\")\/(?!\/)/g, `${previewBasePath}/`);
}

function rewriteLocationHeader(location: string, previewBasePath: string) {
  try {
    if (/^https?:\/\//i.test(location)) {
      const url = new URL(location);
      url.pathname = prefixRootRelativePath(url.pathname, previewBasePath);
      return url.toString();
    }

    return prefixRootRelativePath(location, previewBasePath);
  } catch {
    return location;
  }
}

async function proxyPreview(
  request: Request,
  context: { params: Promise<{ id: string; runId: string; path?: string[] }> },
) {
  const currentUser = isLocalAuthEnabled()
    ? getCurrentUserFromCookieHeader(request.headers.get("cookie"))
    : null;

  if (isLocalAuthEnabled() && !currentUser) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id, runId, path = [] } = await context.params;
  const submission = await getSubmissionById(id);

  if (!submission) {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }

  if (
    currentUser &&
    currentUser.role === "student" &&
    submission.studentEmail.trim().toLowerCase() !== currentUser.email.trim().toLowerCase()
  ) {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }

  const run = submission.sandboxRuns.find((item) => item.id === runId);
  if (!run?.previewHostPort) {
    return NextResponse.json({ error: "preview-unavailable" }, { status: 404 });
  }

  if (run.previewExpiresAt && new Date(run.previewExpiresAt).getTime() < Date.now()) {
    if (run.previewContainerName) {
      await stopSandboxPreview(run.previewContainerName);
    }

    return NextResponse.json(
      { error: "preview-expired", message: "This temporary sandbox preview has expired." },
      { status: 410 },
    );
  }

  const joinedPath = path.join("/");
  const previewBasePath = buildPreviewBasePath(id, runId);
  const targetUrl = new URL(
    `/${joinedPath}${new URL(request.url).search}`,
    `http://127.0.0.1:${run.previewHostPort}`,
  );

  const forwardedHeaders = new Headers(request.headers);
  forwardedHeaders.delete("host");
  forwardedHeaders.delete("connection");
  forwardedHeaders.delete("content-length");
  forwardedHeaders.set("x-forwarded-host", new URL(request.url).host);
  forwardedHeaders.set("x-forwarded-proto", new URL(request.url).protocol.replace(":", ""));
  forwardedHeaders.set("x-forwarded-prefix", previewBasePath);

  const init: RequestInit = {
    method: request.method,
    headers: forwardedHeaders,
    redirect: "manual",
  };

  if (!["GET", "HEAD"].includes(request.method)) {
    init.body = await request.arrayBuffer();
  }

  const upstream = await fetch(targetUrl, init);
  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.delete("content-encoding");
  responseHeaders.delete("content-length");
  responseHeaders.set("cache-control", "no-store");

  const location = responseHeaders.get("location");
  if (location) {
    responseHeaders.set("location", rewriteLocationHeader(location, previewBasePath));
  }

  const contentType = responseHeaders.get("content-type") ?? "";
  if (contentType.includes("text/html")) {
    const html = await upstream.text();
    return new Response(rewritePreviewHtml(html, previewBasePath), {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; runId: string; path?: string[] }> },
) {
  return proxyPreview(request, context);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; runId: string; path?: string[] }> },
) {
  return proxyPreview(request, context);
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string; runId: string; path?: string[] }> },
) {
  return proxyPreview(request, context);
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; runId: string; path?: string[] }> },
) {
  return proxyPreview(request, context);
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string; runId: string; path?: string[] }> },
) {
  return proxyPreview(request, context);
}

export async function HEAD(
  request: Request,
  context: { params: Promise<{ id: string; runId: string; path?: string[] }> },
) {
  return proxyPreview(request, context);
}

export async function OPTIONS(
  request: Request,
  context: { params: Promise<{ id: string; runId: string; path?: string[] }> },
) {
  return proxyPreview(request, context);
}
