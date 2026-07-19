import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import type { Source } from "@prisma/client";
import { prisma } from "@/lib/db";
import { detectPlatform, processSource } from "@/lib/research/extract";
import { isTerminalStatus, TERMINAL_STATUSES } from "@/components/research-types";
import {
  assertInternalCaller,
  dispatchInternal,
  internalHeaders,
  internalUrl,
} from "@/lib/internal-pipeline";

// PLAN.md §3 step 2: fetch + extract + classify one source, then check whether this was the
// last outstanding source for the session and — if so — kick off synthesize.
const FRESHNESS_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days, per PLAN.md §3 step 2

// Best-effort failure classification for the transparency panel. `processSource`'s fetch layer
// deliberately returns null rather than a reason (see lib/research/fetch/*.ts) so this can't be
// exact, but platform is a solid proxy for *why* right now: Reddit's unauthenticated JSON access
// is permanently blocked by Reddit's own policy (not a bug in our client — see SOURCING-PLAN.md),
// so a Reddit null is always "blocked" today; YouTube nulls are almost always missing captions.
// A thrown error only ever comes from the extract/classify LLM call, never the fetch step (those
// are documented "returns null, does not throw").
function classifyFailure(url: string, threw: boolean): string {
  if (threw) return "extraction_error";
  const platform = detectPlatform(url);
  if (platform === "reddit") return "blocked";
  if (platform === "youtube") return "no_transcript";
  return "fetch_failed";
}

// Fetch + extract + classify (or cache-hit link) exactly one URL into this session, and close
// out its SourceAttempt row (succeeded/failed) accordingly. Factored out (2026-07-19 incident
// fix, FIX 2 — see SOURCING-PLAN.md) so the bounded inline backfill below can process a
// replacement candidate in THIS SAME invocation instead of firing another POST at this route —
// that recursive self-dispatch is what caused Vercel's 508 LOOP_DETECTED once a chain of
// failures accumulated enough hops, leaving the rejected hop's SourceAttempt stuck at
// "dispatched" forever and expectedSources never reconciled.
//
// `preloadedExisting` lets the primary-URL caller pass in a Source lookup it already ran in
// parallel with the session lookup (perf — E3 finding); the inline backfill candidate has no such
// parallel opportunity, so it's omitted and this function looks it up itself.
async function processOneUrl(
  sessionId: string,
  url: string,
  preloadedExisting?: Source | null
): Promise<{ succeeded: boolean; threw: boolean }> {
  const existing =
    preloadedExisting !== undefined ? preloadedExisting : await prisma.source.findUnique({ where: { url } });
  const isFresh = existing
    ? Date.now() - existing.updatedAt.getTime() < FRESHNESS_WINDOW_MS
    : false;

  // Every dispatched URL must, one way or another, end up either (a) linked into this session
  // via SessionSource, or (b) excluded from expectedSources — that invariant is what makes the
  // "last one done" count-vs-expected check sound. `processSource` (fetch + LLM) can throw for
  // reasons beyond "no content" — network errors, LLM API failures, or a malformed tool-use
  // response that fails Prisma's enum validation on write — and a thrown error here would abort
  // before either (a) or (b) happens, permanently stalling this session's "last one done"
  // detection. Catch broadly and fall back to (b) so a single bad source degrades gracefully
  // instead of hanging the whole session.
  let sourceFailed = false;
  let threw = false;
  let resolvedSourceId: string | null = null;
  try {
    if (existing && isFresh) {
      // Cache hit — skip fetch + LLM entirely, just link the cached Source into this session.
      await prisma.sessionSource.upsert({
        where: { sessionId_sourceId: { sessionId, sourceId: existing.id } },
        create: { sessionId, sourceId: existing.id },
        update: {},
      });
      resolvedSourceId = existing.id;
    } else {
      // Cache miss or stale — fetch + extract + classify.
      const result = await processSource(url);

      if (result) {
        const source = await prisma.source.upsert({
          where: { url },
          create: {
            url,
            platform: result.platform,
            author: result.author,
            sponsorship: result.sponsorship,
            sponsorConfidence: result.sponsorConfidence,
            summary: result.summary,
            reviewDraft: result.reviewDraft,
            groundednessConfidence: result.groundednessConfidence,
          },
          update: {
            platform: result.platform,
            author: result.author,
            sponsorship: result.sponsorship,
            sponsorConfidence: result.sponsorConfidence,
            summary: result.summary,
            reviewDraft: result.reviewDraft,
            groundednessConfidence: result.groundednessConfidence,
          },
        });

        if (existing) {
          // Refreshing a stale row — drop its old findings before writing the new set so
          // re-classification doesn't pile up duplicates alongside the previous pass.
          await prisma.finding.deleteMany({ where: { sourceId: source.id } });
        }

        if (result.findings.length > 0) {
          await prisma.finding.createMany({
            data: result.findings.map((f) => ({
              sourceId: source.id,
              option: f.option,
              claim: f.claim,
              sentiment: f.sentiment,
              quote: f.quote,
            })),
          });
        }

        await prisma.sessionSource.upsert({
          where: { sessionId_sourceId: { sessionId, sourceId: source.id } },
          create: { sessionId, sourceId: source.id },
          update: {},
        });
        resolvedSourceId = source.id;
      } else {
        sourceFailed = true;
      }
    }
  } catch (err) {
    console.error(`process-source: failed processing ${url} for session ${sessionId}:`, err);
    sourceFailed = true;
    threw = true;
  }

  if (sourceFailed) {
    const failureReason = classifyFailure(url, threw);
    await prisma.sourceAttempt.updateMany({
      where: { sessionId, url },
      data: { status: "failed", failureReason },
    });
  } else if (resolvedSourceId) {
    await prisma.sourceAttempt.updateMany({
      where: { sessionId, url },
      data: { status: "succeeded", sourceId: resolvedSourceId },
    });
  }

  // Session liveness touch (2026-07-19 incident fix, FIX 5): STALE_SESSION_MS assumes silence
  // means death, reaping the session at 10 minutes. Without this, a session actively grinding
  // through a long Groq-throttled tail of successes (each extract+classify call now waiting up
  // to ~40s for a real retry-after window, see lib/llm.ts's withRateLimitRetry) looks identical
  // to a genuinely dead one — this touch keeps it alive as long as work is actually landing.
  await prisma.researchSession.update({
    where: { id: sessionId },
    data: { updatedAt: new Date() },
  });

  return { succeeded: !sourceFailed, threw };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // This is an internal pipeline hop, never a public endpoint — without this check, anyone
  // holding (or guessing) a session id could inject arbitrary sources into it, burn the Groq/
  // Google quota unboundedly, or force a re-synthesize. See the security review's S1 finding.
  const authError = assertInternalCaller(request);
  if (authError) return authError;

  const { id: sessionId } = await params;

  const body = await request.json().catch(() => null);
  const url = typeof body?.url === "string" ? body.url : "";
  if (!url) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  // Only http(s) may be fetched/stored — a non-http URL (file:, javascript:, etc.) would still
  // get persisted to Source.url and rendered as a raw <a href> in the source list (S3 finding).
  try {
    const scheme = new URL(url).protocol;
    if (scheme !== "http:" && scheme !== "https:") {
      return NextResponse.json({ error: "unsupported URL scheme" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "invalid url" }, { status: 400 });
  }

  // Independent lookups — run together rather than two sequential round-trips (E3 finding). The
  // source lookup is occasionally wasted on the rare terminal-status early-return path below,
  // a fine trade for cutting a round-trip off the common (non-terminal) path.
  const [session, existing] = await Promise.all([
    prisma.researchSession.findUnique({ where: { id: sessionId } }),
    prisma.source.findUnique({ where: { url } }),
  ]);
  if (!session) {
    return NextResponse.json({ error: "session not found" }, { status: 404 });
  }

  // Stray/duplicate invocation arriving after the session already reached a terminal status —
  // nothing useful to do for the session itself (mirrors the same guard used for the completion
  // check below), but this URL's SourceAttempt row still needs closing out — otherwise it's
  // stuck showing "pending" in the transparency panel forever (review finding, 2026-07-17): a
  // session reaped as timed_out (GET /api/research/[id]'s staleness check) can leave in-flight
  // process-source calls landing after the fact, and without this update their attempt rows
  // would never resolve even though the session itself is done.
  if (isTerminalStatus(session.status)) {
    await prisma.sourceAttempt.updateMany({
      where: { sessionId, url, status: { in: ["dispatched", "discovered"] } },
      data: { status: "failed", failureReason: "session_ended" },
    });
    return NextResponse.json({ ok: true });
  }

  // Invocation-start touch: reset this attempt's updatedAt now that its invocation actually
  // began. Attempt rows are created (clock started) at dispatch-queue time in continueSearch,
  // but the dispatch itself is staggered up to cap*DISPATCH_STAGGER_MS (~125s for Pro) — without
  // this touch, the hop-loss reconciler (GET /api/research/[id]) would measure that queue delay
  // against ATTEMPT_STALE_MS and write off late-staggered attempts that are perfectly healthy.
  // A hop whose dispatch was rejected outright (the 508 LOOP_DETECTED case) never runs this
  // line, so its clock correctly keeps running from creation. Backfill candidates don't need
  // it — the claim write in the backfill loop below refreshes their updatedAt already.
  await prisma.sourceAttempt.updateMany({
    where: { sessionId, url, status: "dispatched" },
    data: { updatedAt: new Date() },
  });

  const primaryResult = await processOneUrl(sessionId, url, existing);

  if (!primaryResult.succeeded) {
    // Bounded inline backfill (2026-07-19 incident fix, FIX 2): before shrinking expectedSources,
    // try to claim one "discovered" (overflow, past the plan's cap) SourceAttempt as a
    // replacement — but process it INLINE, right here, instead of re-dispatching a POST to this
    // route. Claim via a conditional updateMany (not a plain update) so two concurrent failures
    // can't both grab the same overflow candidate — the loser's updateMany matches zero rows
    // since Postgres serializes the two UPDATEs. Retries against a few candidates (not just one,
    // review finding 2026-07-17): near-simultaneous failures can both fetch the SAME oldest
    // "discovered" row before either commits its claim. Capped at BACKFILL_CLAIM_ATTEMPTS so this
    // can't loop indefinitely if the overflow pool is being claimed by many concurrent failures.
    //
    // Preferring web candidates (platform desc — youtube < reddit < web in the schema's enum
    // declaration order, see prisma/schema.prisma) mirrors the priority-dispatch rationale in
    // app/api/research/route.ts: YouTube is IP-blocked from Vercel in production and Reddit needs
    // a paid Browserbase tier, so a web candidate is the one actually likely to succeed.
    //
    // Accounting invariant (read this before touching the logic below): the failed primary URL
    // owns exactly one expectedSources slot. Claim at most ONE candidate and process it ONCE —
    // never chain to a second candidate on failure. If a candidate is claimed and succeeds, that
    // slot is filled by the candidate (no decrement — SessionSource count already reflects the
    // fill). If a candidate is claimed and it ALSO fails, only the one original slot ever
    // existed, so exactly one decrement covers both failed attempts. If no candidate is
    // available at all, the slot is simply unfillable — exactly one decrement. Any further
    // overflow is left for a later invocation's own backfill or the hop-loss reconciler in
    // app/api/research/[id]/route.ts's GET.
    const BACKFILL_CLAIM_ATTEMPTS = 3;
    let claimedCandidateUrl: string | null = null;
    for (let attempt = 0; attempt < BACKFILL_CLAIM_ATTEMPTS && !claimedCandidateUrl; attempt++) {
      const candidate = await prisma.sourceAttempt.findFirst({
        where: { sessionId, status: "discovered" },
        orderBy: [{ platform: "desc" }, { createdAt: "asc" }],
      });
      if (!candidate) break;

      const claimed = await prisma.sourceAttempt.updateMany({
        where: { id: candidate.id, status: "discovered" },
        data: { status: "dispatched" },
      });
      if (claimed.count > 0) {
        claimedCandidateUrl = candidate.url;
      }
      // Lost the race for this candidate — loop and try the next-oldest "discovered" row.
    }

    if (claimedCandidateUrl) {
      const candidateResult = await processOneUrl(sessionId, claimedCandidateUrl);
      if (!candidateResult.succeeded) {
        await prisma.researchSession.update({
          where: { id: sessionId },
          data: { expectedSources: { decrement: 1 } },
        });
      }
    } else {
      // No replacement left in the overflow pool — shrink the expected total instead so the
      // count-vs-expected completion check below still resolves.
      await prisma.researchSession.update({
        where: { id: sessionId },
        data: { expectedSources: { decrement: 1 } },
      });
    }
  }

  // Check if last: re-read the freshest expectedSources (may have just been decremented above,
  // by this call or a concurrent one) and the current SessionSource count. Runs exactly once,
  // after all inline work above (primary URL plus, if applicable, the one inline backfill
  // candidate) is done.
  const [freshSession, sourceCount] = await Promise.all([
    prisma.researchSession.findUnique({ where: { id: sessionId } }),
    prisma.sessionSource.count({ where: { sessionId } }),
  ]);

  if (!freshSession) {
    return NextResponse.json({ ok: true });
  }

  // Terminal statuses ("done"/"failed") must never be left by the completion check below —
  // besides the "synthesizing" self-guard (multiple concurrent callers racing to be "the last
  // one"), this also guards against a session that has already reached a terminal status
  // (e.g. a stray/duplicate process-source invocation arriving after synthesize already ran)
  // from being flipped back into "synthesizing" and re-triggering synthesis.
  if (sourceCount >= freshSession.expectedSources && !isTerminalStatus(freshSession.status)) {
    if (sourceCount === 0) {
      // Every dispatched URL failed to fetch — nothing to synthesize from.
      await prisma.researchSession.updateMany({
        where: { id: sessionId, status: { notIn: TERMINAL_STATUSES } },
        data: { status: "failed", failureReason: "all_sources_failed" },
      });
    } else {
      // Race guard: multiple concurrent process-source calls can each observe "count reached
      // expected" at once. Only the caller that successfully flips status away from
      // "synthesizing" (via this conditional updateMany) is allowed to trigger synthesize —
      // any later caller's updateMany matches zero rows and does nothing further.
      const flipped = await prisma.researchSession.updateMany({
        where: { id: sessionId, status: { notIn: ["synthesizing", ...TERMINAL_STATUSES] } },
        data: { status: "synthesizing" },
      });

      if (flipped.count > 0) {
        const target = internalUrl(`/api/research/${sessionId}/synthesize`, request);
        waitUntil(
          dispatchInternal(
            target,
            { method: "POST", headers: internalHeaders() },
            "process-source"
          )
        );
      }
    }
  }

  return NextResponse.json({ ok: true });
}
