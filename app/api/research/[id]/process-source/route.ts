import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
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

  const isFresh = existing
    ? Date.now() - existing.updatedAt.getTime() < FRESHNESS_WINDOW_MS
    : false;

  // Every dispatched URL must, one way or another, end up either (a) linked into this session
  // via SessionSource, or (b) excluded from expectedSources — that invariant is what makes the
  // "last one done" count-vs-expected check below sound. `processSource` (fetch + LLM) can throw
  // for reasons beyond "no content" — network errors, LLM API failures, or a malformed tool-use
  // response that fails Prisma's enum validation on write — and a thrown error here would abort
  // the handler before either (a) or (b) happens, permanently stalling this session's "last one
  // done" detection (it would sit in a non-terminal status forever). Catch broadly and fall back
  // to (b) so a single bad source degrades gracefully instead of hanging the whole session.
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

    // Bounded backfill (2026-07-16, source-count fix): before shrinking expectedSources, try to
    // claim one "discovered" (overflow, past the plan's cap) SourceAttempt as a replacement, so
    // sessions actually approach the advertised source cap instead of every failure just
    // permanently lowering the target. Claim via a conditional updateMany (not a plain update)
    // so two concurrent failures can't both grab the same overflow candidate — the loser's
    // updateMany matches zero rows since Postgres serializes the two UPDATEs.
    //
    // Retries against a few candidates (not just one) — review finding, 2026-07-17: near-
    // simultaneous failures (plausible even with staggered dispatch, e.g. two same-cause
    // timeouts landing close together) can both fetch the SAME oldest "discovered" row before
    // either commits its claim; without a retry, the loser gave up even when a second, untouched
    // candidate existed. Capped at BACKFILL_CLAIM_ATTEMPTS so this can't loop indefinitely if the
    // overflow pool is being claimed by many concurrent failures at once.
    const BACKFILL_CLAIM_ATTEMPTS = 3;
    let backfilled = false;
    for (let attempt = 0; attempt < BACKFILL_CLAIM_ATTEMPTS && !backfilled; attempt++) {
      const candidate = await prisma.sourceAttempt.findFirst({
        where: { sessionId, status: "discovered" },
        orderBy: { createdAt: "asc" },
      });
      if (!candidate) break;

      const claimed = await prisma.sourceAttempt.updateMany({
        where: { id: candidate.id, status: "discovered" },
        data: { status: "dispatched" },
      });
      if (claimed.count > 0) {
        backfilled = true;
        const target = internalUrl(`/api/research/${sessionId}/process-source`, request);
        waitUntil(
          dispatchInternal(
            target,
            {
              method: "POST",
              headers: internalHeaders({ "Content-Type": "application/json" }),
              body: JSON.stringify({ url: candidate.url }),
            },
            "process-source backfill"
          )
        );
      }
      // Lost the race for this candidate — loop and try the next-oldest "discovered" row.
    }

    if (!backfilled) {
      // No replacement left in the overflow pool — shrink the expected total instead so the
      // count-vs-expected completion check below still resolves.
      await prisma.researchSession.update({
        where: { id: sessionId },
        data: { expectedSources: { decrement: 1 } },
      });
    }
  } else if (resolvedSourceId) {
    await prisma.sourceAttempt.updateMany({
      where: { sessionId, url },
      data: { status: "succeeded", sourceId: resolvedSourceId },
    });
  }

  // Check if last: re-read the freshest expectedSources (may have just been decremented above,
  // by this call or a concurrent one) and the current SessionSource count.
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
