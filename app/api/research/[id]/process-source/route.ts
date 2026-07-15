import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { prisma } from "@/lib/db";
import { processSource } from "@/lib/research/extract";
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
  // nothing useful to do (mirrors the same guard used for the completion check below).
  if (isTerminalStatus(session.status)) {
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
  try {
    if (existing && isFresh) {
      // Cache hit — skip fetch + LLM entirely, just link the cached Source into this session.
      await prisma.sessionSource.upsert({
        where: { sessionId_sourceId: { sessionId, sourceId: existing.id } },
        create: { sessionId, sourceId: existing.id },
        update: {},
      });
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
          },
          update: {
            platform: result.platform,
            author: result.author,
            sponsorship: result.sponsorship,
            sponsorConfidence: result.sponsorConfidence,
            summary: result.summary,
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
      } else {
        sourceFailed = true;
      }
    }
  } catch (err) {
    console.error(`process-source: failed processing ${url} for session ${sessionId}:`, err);
    sourceFailed = true;
  }

  if (sourceFailed) {
    // Fetch/extract/classify failed (or threw) — don't create/link a Source row, but this URL
    // still counts as "done" for completion-detection purposes. Since no SessionSource row is
    // created for it, shrink the expected total instead so the count-vs-expected check below
    // still resolves.
    await prisma.researchSession.update({
      where: { id: sessionId },
      data: { expectedSources: { decrement: 1 } },
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
