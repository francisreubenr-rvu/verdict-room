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
// origin. VERCEL_URL is the platform-assigned deployment hostname, not attacker-influenceable;
// fall back to request.url only for local dev, where VERCEL_URL doesn't exist.
export function internalUrl(path: string, request: Request): URL {
  const base = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : request.url;
  return new URL(path, base);
}
