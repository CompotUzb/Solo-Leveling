import { timingSafeEqual } from "node:crypto";

/**
 * Optional shared-secret guard for the HTTP API.
 *
 * The app is local-first, so leaving `API_AUTH_TOKEN` unset keeps every route open — that is
 * the right default on `127.0.0.1`. The moment the API is bound to a reachable host (the
 * Docker/cloud smoke deploy documented in the README, or the Android blocker talking to a LAN
 * address) an unauthenticated API lets anyone who can reach the URL award XP, clear penalties,
 * and read the Hunter's full activity history. Setting the token closes that hole without
 * changing anything for a purely local run.
 */

/** Routes that must stay reachable without a token so uptime checks and probes keep working. */
const PUBLIC_API_PATHS = new Set(["/api/health"]);

export function isPublicApiPath(pathname: string): boolean {
  return PUBLIC_API_PATHS.has(pathname);
}

/** Only `/api/*` is guarded; the static dashboard bundle is served openly. */
export function isGuardedApiPath(pathname: string): boolean {
  return pathname.startsWith("/api/") && !isPublicApiPath(pathname);
}

/**
 * Read the caller's token. `Authorization: Bearer` is the primary form; `x-api-token` is a
 * convenience for the Android client, and `?token=` exists because the browser `EventSource`
 * API cannot set headers on the SSE stream.
 */
export function extractRequestToken(
  headers: Record<string, string | string[] | undefined>,
  query: unknown,
): string | null {
  const authorization = headers.authorization;
  const header = Array.isArray(authorization) ? authorization[0] : authorization;
  if (header) {
    const match = /^Bearer\s+(.+)$/i.exec(header.trim());
    if (match) return match[1].trim();
  }

  const apiToken = headers["x-api-token"];
  const direct = Array.isArray(apiToken) ? apiToken[0] : apiToken;
  if (direct?.trim()) return direct.trim();

  const queryToken = (query as { token?: unknown } | null | undefined)?.token;
  if (typeof queryToken === "string" && queryToken.trim())
    return queryToken.trim();

  return null;
}

/** Constant-time comparison so a wrong token cannot be recovered byte-by-byte from timings. */
export function tokensMatch(expected: string, received: string | null): boolean {
  if (received == null) return false;
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(received, "utf8");
  // `timingSafeEqual` throws on a length mismatch, so compare lengths separately. The length
  // of a token is not the secret; its bytes are.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * True when the API is reachable beyond this machine. Used to warn on an open deployment.
 * `::` and `0.0.0.0` are the wildcard binds; anything that is not an explicit loopback address
 * is treated as externally reachable.
 */
export function isExternallyReachableHost(host: string): boolean {
  const normalized = host.trim().toLowerCase().replace(/^\[|\]$/g, "");
  return !["127.0.0.1", "localhost", "::1", "0:0:0:0:0:0:0:1"].includes(
    normalized,
  );
}
