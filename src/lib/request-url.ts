import "server-only";

export function getRequestOrigin(request: Request) {
  const forwardedHost = request.headers.get("x-forwarded-host")?.trim();
  const forwardedProto = request.headers.get("x-forwarded-proto")?.trim();
  const host = forwardedHost || request.headers.get("host")?.trim();

  if (host) {
    const proto = forwardedProto || (host.startsWith("localhost") ? "http" : "http");
    return `${proto}://${host}`;
  }

  return new URL(request.url).origin;
}

export function buildRequestUrl(request: Request, pathname: string) {
  return new URL(pathname, getRequestOrigin(request));
}
