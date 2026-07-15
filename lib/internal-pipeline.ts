// The Verdict Room — internal auth + origin helpers for the chained research pipeline
// (POST /api/research -> process-source -> synthesize). These routes are server-to-server hops
// triggered via `waitUntil`, never meant to be called directly by a browser or a script with a
// guessed session id — see the security review that flagged them as unauthenticated public
// routes (quota bypass, cross-user session tampering).

const HEADER = "x-internal-pipeline-secret";

// Fail closed in production (no silent no-op auth check), but don't block local `bun dev` before
// a session sets the var — matches lib/llm.ts's "lazy, don't crash at import time" posture.
export function assertInternalCaller(request: Request): Response | null {
  const expected = process.env.INTERNAL_PIPELINE_SECRET;
  if (!expected) {
    if (process.env.NODE_ENV === "production") {
      return new Response(
        JSON.stringify({ error: "INTERNAL_PIPELINE_SECRET is not configured" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
    return null;
  }
  if (request.headers.get(HEADER) !== expected) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return null;
}

export function internalHeaders(extra?: Record<string, string>): Record<string, string> {
  const secret = process.env.INTERNAL_PIPELINE_SECRET;
  return {
    ...extra,
    ...(secret ? { [HEADER]: secret } : {}),
  };
}

// Building the next hop's URL from `new URL(path, request.url)` trusts the inbound Host header,
// which some Vercel preview configurations forward from client-supplied values — a spoofed Host
// would redirect the chained fetch (including the source URL body) to an attacker-controlled
// origin. VERCEL_PROJECT_PRODUCTION_URL is the project's assigned production domain (e.g.
// verdict-room.vercel.app) — platform-assigned, not attacker-influenceable, and NOT behind
// Vercel's deployment-protection SSO wall.
//
// Confirmed live 2026-07-15: an earlier version of this used VERCEL_URL (the per-deployment
// hostname, e.g. verdict-room-<hash>-<team>.vercel.app) instead — that one IS behind deployment
// protection by default. The waitUntil fetch got silently 302-redirected to
// vercel.com/sso-api instead of reaching process-source, with no error anywhere (fetch() doesn't
// reject on a redirect/non-2xx, and nothing here was checking response.ok), reproducing the
// exact "zero process-source invocations, zero errors" symptom the original Google Search bug
// had — diagnosed by testing the per-deployment URL directly and finding the SSO redirect.
export function internalUrl(path: string, request: Request): URL {
  const base = process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : request.url;
  return new URL(path, base);
}

// waitUntil(fetch(...)) alone swallows everything: a non-2xx response (redirect, 401, 500) is
// not a rejected promise, so nothing here would ever know a hop failed to actually run — this is
// exactly how two real bugs (Google Search silently failing, then VERCEL_URL's deployment-
// protection redirect) went undetected until a live end-to-end test caught them. Logs on any
// non-ok response or thrown error so a future regression shows up in `get_runtime_errors` instead
// of requiring another live investigation. Returns the fetch promise so the caller can still pass
// it to waitUntil() to extend the invocation's lifetime.
export function dispatchInternal(url: URL, init: RequestInit, context: string): Promise<void> {
  return fetch(url, init)
    .then((response) => {
      if (!response.ok) {
        console.error(`${context}: internal dispatch to ${url} returned ${response.status}`);
      }
    })
    .catch((err) => {
      console.error(`${context}: internal dispatch to ${url} threw`, err);
    });
}
