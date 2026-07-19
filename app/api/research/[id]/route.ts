import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { ATTEMPT_STALE_MS, isStale, isTerminalStatus, TERMINAL_STATUSES } from "@/components/research-types";
import { dispatchInternal, internalHeaders, internalUrl } from "@/lib/internal-pipeline";

// GET /api/research/[id] — session state + linked sources, per the contract in
// components/research-types.ts (ResearchSessionResponse). Per-finding detail is never rendered
// by any client (the report shows synthesized Options, the source list shows per-source
// summaries) — omitted from both the query and the response to avoid shipping a growing
// three-table join on every ~2s poll (E1 finding).
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // A research session's query text and verdict are exactly the private data the pricing page's
  // FAQ promises to protect — the id's cuid entropy is not access control. Hard-401 rather than
  // silently scoping to "any session" for an unauthenticated caller (S2 finding — the old
  // comment's premise, that RLS covers this, doesn't hold: Prisma connects as a role that
  // bypasses RLS, see DEPLOY.md §g).
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const session = await prisma.researchSession.findFirst({
    where: { id, userId: user.id },
    include: {
      sources: { include: { source: true } },
      attempts: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!session) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // A session stuck in a non-terminal status past the staleness window almost certainly lost a
  // waitUntil hop — reap it here so the client's poll loop terminates instead of running forever
  // (A1 finding).
  let status: string = session.status;
  let failureReason: string | null = session.failureReason;
  let expectedSources = session.expectedSources;
  let attemptRows = session.attempts;
  if (isStale(session.status, session.updatedAt)) {
    const reaped = await prisma.researchSession.updateMany({
      where: { id: session.id, status: { notIn: TERMINAL_STATUSES } },
      data: { status: "failed", failureReason: "timed_out" },
    });
    if (reaped.count > 0) {
      status = "failed";
      failureReason = "timed_out";
      // The session is now terminal but any attempt row still in flight (a process-source call
      // that never landed) would otherwise be stuck at "dispatched"/"discovered" forever — close
      // those out too so the transparency panel doesn't show phantom pending sources.
      await prisma.sourceAttempt.updateMany({
        where: { sessionId: session.id, status: { in: ["dispatched", "discovered"] } },
        data: { status: "failed", failureReason: "session_ended" },
      });
    }
  }

  // Hop-loss reconciler (2026-07-19 incident fix, FIX 1 — see SOURCING-PLAN.md). Runs on every
  // poll of a non-terminal, non-stale-reaped session. A "dispatched" SourceAttempt whose
  // updatedAt hasn't moved in ATTEMPT_STALE_MS means its process-source invocation died in
  // flight or was rejected outright (e.g. the 508 LOOP_DETECTED recursion-depth rejection that
  // caused this incident) — without this, that lost hop's slot never resolves, expectedSources
  // never reconciles, and the session just runs out the STALE_SESSION_MS clock and gets reaped
  // as "timed_out" even when every other source succeeded. Fast path (no stale attempts, the
  // overwhelming common case) costs exactly one indexed query (on SourceAttempt.sessionId) on
  // top of the normal GET — everything below only runs when that query finds something.
  // Gated on the session itself having gone quiet (no completion has touched its updatedAt for
  // 60s — see process-source's liveness touch): while sources are actively landing, in-flight
  // attempts are presumed alive even past ATTEMPT_STALE_MS, since a legitimate straggler under
  // Groq retry-after waits can spend minutes working. Only when the whole session has stalled
  // does an old "dispatched" row get written off. A false positive here is benign anyway (the
  // late invocation still links its Source and overwrites the attempt row back to succeeded),
  // but the gate keeps the common busy-session path from reconciling prematurely.
  const SESSION_QUIET_MS = 60 * 1000;
  const sessionQuiet = Date.now() - session.updatedAt.getTime() > SESSION_QUIET_MS;
  if (!isTerminalStatus(status) && sessionQuiet) {
    const attemptCutoff = new Date(Date.now() - ATTEMPT_STALE_MS);
    const lostHops = await prisma.sourceAttempt.updateMany({
      where: { sessionId: session.id, status: "dispatched", updatedAt: { lt: attemptCutoff } },
      data: { status: "failed", failureReason: "hop_lost" },
    });

    if (lostHops.count > 0) {
      const freshSession = await prisma.researchSession.update({
        where: { id: session.id },
        data: { expectedSources: { decrement: lostHops.count } },
      });
      expectedSources = freshSession.expectedSources;

      // Re-fetch attempts so this response's transparency panel reflects the reclassification
      // immediately instead of showing "pending" for one more ~2s poll cycle.
      attemptRows = await prisma.sourceAttempt.findMany({
        where: { sessionId: session.id },
        orderBy: { createdAt: "asc" },
      });

      const sourceCount = await prisma.sessionSource.count({ where: { sessionId: session.id } });

      // Mirrors process-source/route.ts's own completion check exactly — same race-guard and
      // terminal-status self-guard rationale applies here (this GET can run concurrently with an
      // in-flight process-source call reaching the same "last one done" conclusion).
      if (sourceCount >= expectedSources && !isTerminalStatus(freshSession.status)) {
        if (sourceCount === 0) {
          const flippedToFailed = await prisma.researchSession.updateMany({
            where: { id: session.id, status: { notIn: TERMINAL_STATUSES } },
            data: { status: "failed", failureReason: "all_sources_failed" },
          });
          if (flippedToFailed.count > 0) {
            status = "failed";
            failureReason = "all_sources_failed";
          }
        } else {
          const flipped = await prisma.researchSession.updateMany({
            where: { id: session.id, status: { notIn: ["synthesizing", ...TERMINAL_STATUSES] } },
            data: { status: "synthesizing" },
          });
          if (flipped.count > 0) {
            status = "synthesizing";
            // This GET is user-facing (no INTERNAL_PIPELINE_SECRET on the inbound request) — that's
            // fine, internalHeaders() adds the secret to this OUTBOUND dispatch to synthesize.
            const target = internalUrl(`/api/research/${session.id}/synthesize`, request);
            waitUntil(
              dispatchInternal(
                target,
                { method: "POST", headers: internalHeaders() },
                "GET /api/research/[id] hop-loss reconciler"
              )
            );
          }
        }
      }
    }
  }

  const sources = session.sources.map(({ source }) => ({
    id: source.id,
    url: source.url,
    platform: source.platform,
    author: source.author,
    sponsorship: source.sponsorship,
    sponsorConfidence: source.sponsorConfidence,
    summary: source.summary,
    reviewDraft: source.reviewDraft,
    groundednessConfidence: source.groundednessConfidence,
    transcript: source.transcript,
  }));

  const attempts = attemptRows.map((attempt) => ({
    id: attempt.id,
    url: attempt.url,
    platform: attempt.platform,
    status: attempt.status,
    failureReason: attempt.failureReason,
    sourceId: attempt.sourceId,
  }));

  return NextResponse.json({
    id: session.id,
    query: session.query,
    status,
    expectedSources,
    failureReason,
    verdictJson: session.verdictJson,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
    sources,
    attempts,
  });
}
