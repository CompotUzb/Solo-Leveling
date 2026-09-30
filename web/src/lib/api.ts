import { useEffect, useState } from "react";

// Thin typed fetch layer over the local API plus a small data-fetching hook that
// exposes the three states every dashboard section needs: loading, error, data.

const TOKEN_STORAGE_KEY = "solo-leveling.api-token";

/**
 * The API is unauthenticated on a local run. When it is deployed somewhere reachable and
 * `API_AUTH_TOKEN` is set, the dashboard picks the token up once from `?token=...` in the URL,
 * stores it, and strips it from the address bar so it is not left in history or shared links.
 */
function readStoredToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    // Private-mode / disabled storage: fall back to an unauthenticated request.
    return null;
  }
}

export function captureTokenFromUrl(): void {
  const url = new URL(window.location.href);
  const token = url.searchParams.get("token");
  if (!token) return;
  try {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } catch {
    // Ignore: the request below still carries the token for this page load.
  }
  url.searchParams.delete("token");
  window.history.replaceState(null, "", url.toString());
}

export function authHeaders(): Record<string, string> {
  const token = readStoredToken();
  return token ? { authorization: `Bearer ${token}` } : {};
}

/** `EventSource` cannot set headers, so the SSE stream takes the token as a query param. */
export function withAuthQuery(path: string): string {
  const token = readStoredToken();
  if (!token) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}token=${encodeURIComponent(token)}`;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function fetchJson<T>(
  path: string,
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetch(path, {
    signal,
    headers: { accept: "application/json", ...authHeaders() },
  });
  if (!res.ok) {
    throw new ApiError(`Request to ${path} failed (${res.status})`, res.status);
  }
  return (await res.json()) as T;
}

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/** POST JSON and return the parsed response (used by the interactive Daily Quest panel). */
export async function postJson<T>(
  path: string,
  body: unknown = {},
): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = "";
    try {
      const body = (await res.json()) as { error?: string; message?: string };
      detail = body.message ?? body.error ?? "";
    } catch {
      detail = "";
    }
    throw new ApiError(
      `Request to ${path} failed (${res.status})${detail ? `: ${detail}` : ""}`,
      res.status,
    );
  }
  return (await res.json()) as T;
}

/**
 * Fetch `path` once on mount and whenever a dependency in `deps` changes.
 * Aborts the in-flight request on unmount so unmounted sections never set state.
 */
export function useEndpoint<T>(
  path: string,
  deps: unknown[] = [],
): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    const controller = new AbortController();
    setState({ data: null, loading: true, error: null });
    fetchJson<T>(path, controller.signal)
      .then((data) => setState({ data, loading: false, error: null }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        const message = err instanceof Error ? err.message : "Unknown error";
        setState({ data: null, loading: false, error: message });
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}
