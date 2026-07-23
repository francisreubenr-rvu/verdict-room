import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { generateSearchQueries } from "@/lib/llm";
import { webSearch, youtubeSearch, SearchProviderError } from "@/lib/research/search";
import { detectPlatform } from "@/lib/research/extract";
import { dispatchInternal, internalHeaders, internalUrl } from "@/lib/internal-pipeline";
import { STALE_SESSION_MS, TERMINAL_STATUSES } from "@/components/research-types";
import {
  FREE_MONTHLY_REPORT_LIMIT,
  countReportsThisMonth,
  findRecentDuplicateSession,
  getPlanForUser,
  sourceCapForPlan,
  type Plan,
} from "@/lib/billing";

// GET /api/research — PLAN.md §6 M5: the current user's research sessions, most recent first,
// for the landing page's "Recent research" list, plus real usage (SITE-REDESIGN-PLAN.md §Stage C)
// so /app can render "X of N free reports left" without fabricating a number. Scoped to userId
// at the application layer — the real enforcement (Prisma connects via a role that bypasses RLS,
// see DEPLOY.md §g) — hard 401 for unauthenticated callers since this is a listing of private
// history, not a single session lookup.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Reap any of this user's sessions that lost a waitUntil hop before listing — otherwise a
  // stuck session's badge reads "Fetching…" indefinitely with no way for the client to know to
  // stop treating it as in-progress (A1/E6).
  //
  // Synthesis-aware split (2026-07-23 incident: a stale-but-recoverable session with 22 linked
  // sources was getting hard-failed here before the user ever opened it, pre-empting the
  // per-session GET /api/research/[id] synthesis-on-reap path that would otherwise turn it into a
  // real verdict). A stale session that already gathered usable sources is not a dead end — only
  // a stale session with ZERO linked sources is. So this bulk reap must only hard-fail the
  // zero-source set; sessions with sources are left non-terminal on purpose, for the per-session
  // GET to pick up and synthesize the next time it's polled/opened.
  const staleCutoff = new Date(Date.now() - STALE_SESSION_MS);
  const staleSessions = await prisma.researchSession.findMany({
    where: {
      userId: user.id,
      status: { notIn: TERMINAL_STATUSES },
      updatedAt: { lt: staleCutoff },
    },
    select: { id: true },
  });

  if (staleSessions.length > 0) {
    const staleIds = staleSessions.map((s) => s.id);

    // Single grouped query (not N+1 counts) to find which of the stale candidates have at least
    // one linked source — those are excluded from the fail-reap below.
    const staleIdsWithSources = await prisma.sessionSource.groupBy({
      by: ["sessionId"],
      where: { sessionId: { in: staleIds } },
    });
    const sourcedIds = new Set(staleIdsWithSources.map((row) => row.sessionId));
    const failIds = staleIds.filter((id) => !sourcedIds.has(id));

    if (failIds.length > 0) {
      // The updateMany repeats the full staleness condition, not just the ids — a session can
      // legitimately complete (or resume progressing, refreshing updatedAt) in the gap after the
      // findMany above, and an id-only update would clobber its real terminal status back to
      // failed/timed_out (Round 2 roast finding).
      await prisma.researchSession.updateMany({
        where: {
          id: { in: failIds },
          status: { notIn: TERMINAL_STATUSES },
          updatedAt: { lt: staleCutoff },
        },
        data: { status: "failed", failureReason: "timed_out" },
      });
      // Same reap, closing out any attempt row still stuck at "dispatched"/"discovered" for the
      // sessions just flipped to failed — otherwise the transparency panel shows phantom pending
      // sources for a session that's already terminal (see app/api/research/[id]/route.ts GET).
      // The relation filter scopes this to sessions the reap actually flipped (or that were
      // already failed) — a session that escaped the reap by completing keeps its attempt rows.
      await prisma.sourceAttempt.updateMany({
        where: {
          sessionId: { in: failIds },
          status: { in: ["dispatched", "discovered"] },
          session: { status: "failed" },
        },
        data: { status: "failed", failureReason: "session_ended" },
      });
    }
    // staleIds that ARE in sourcedIds are intentionally untouched here — left non-terminal so
    // GET /api/research/[id]'s stale-reap synthesis path can flip them to "synthesizing" and
    // dispatch a real verdict from their linked sources the next time that session is polled.
  }

  const [sessions, plan, used] = await Promise.all([
    prisma.researchSession.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, query: true, status: true, failureReason: true, createdAt: true },
    }),
    getPlanForUser(user.id),
    countReportsThisMonth(user.id),
  ]);

  return NextResponse.json({
    sessions: sessions.map((session) => ({
      id: session.id,
      query: session.query,
      status: session.status,
      failureReason: session.failureReason,
      createdAt: session.createdAt.toISOString(),
    })),
    usage: {
      plan,
      used,
      limit: plan === "pro" ? null : FREE_MONTHLY_REPORT_LIMIT,
    },
  });
}

// Two independent discovery routes, merged: Jina's general web search (webSearch) is primary —
// its own SearchProviderError propagates so the caller can tell "the provider is down" apart
// from "it found nothing." youtubeSearch is purely additive and never throws, so a Jina outage
// degrades to "fewer sources from YouTube alone" instead of a hard failure — this is the actual
// payoff of not relying on a single source finder (user request, 2026-07-15). A direct Reddit
// search route was evaluated and dropped — see lib/research/search.ts for why (live 403s).
//
// youtubeSearch runs once per query (capped) instead of once per session — changed 2026-07-16:
// firing it only once against a single hardcoded "<product> review" string was a second driver
// of the source-count collapse (PLAN.md's own YouTube discovery route contributing almost
// nothing to the total). Capped rather than run against all 3-10 generated queries to bound
// the extra unauthenticated-fetch volume against YouTube's own rate/bot-detection tolerance.
const YOUTUBE_QUERY_CAP = 3;

async function discoverSources(
  queries: string[],
  productTerm: string
): Promise<{ urls: string[]; searchFailed: boolean }> {
  const seen = new Set<string>();
  const urls: string[] = [];
  let webSearchOk = false;

  try {
    const batches = await Promise.all(queries.map((q) => webSearch(q)));
    webSearchOk = true;
    for (const batch of batches) {
      for (const result of batch) {
        if (!seen.has(result.url)) {
          seen.add(result.url);
          urls.push(result.url);
        }
      }
    }
  } catch (err) {
    if (!(err instanceof SearchProviderError)) throw err;
    // Fall through — youtubeSearch may still contribute below.
  }

  const ytQueries =
    queries.length > 0 ? queries.slice(0, YOUTUBE_QUERY_CAP) : [`${productTerm} review`];
  const ytBatches = await Promise.all(ytQueries.map((q) => youtubeSearch(q)));
  for (const batch of ytBatches) {
    for (const result of batch) {
      if (!seen.has(result.url)) {
        seen.add(result.url);
        urls.push(result.url);
      }
    }
  }

  // Only a total failure if the primary provider errored AND nothing else contributed anything —
  // a Jina outage with YouTube results still available is a degraded success, not a failure.
  const searchFailed = !webSearchOk && urls.length === 0;
  return { urls, searchFailed };
}

// Staggering the process-source dispatch matters much more now that a Pro session can request up
// to PRO_SOURCE_CAP (50) sources: firing 50 concurrent extract+classify calls at once would blow
// through Groq's free-tier 30 req/min ceiling immediately. This runs entirely inside the
// waitUntil-tracked tail below (see continueSearch), never blocking the client-facing response,
// so the delay costs nothing in perceived latency.
//
// Raised from 1200ms to 2500ms 2026-07-15: confirmed live at 1200ms a 41-source session still
// hit repeated 429s (Groq's 30 req/min ceiling is 1 request per 2s sustainable, and each request
// also holds a token reservation for a few seconds, not just a request slot) — roughly half the
// sources failed. 2500ms trades session completion time for reliability, which matters more here
// since the whole point of the higher source cap is actually gathering that many sources.
const DISPATCH_STAGGER_MS = 2500;

// Platform-priority dispatch (originally 2026-07-19 incident fix, see SOURCING-PLAN.md; revised
// 2026-07-19 product-experience brief). YouTube transcript fetch used to be a doomed URL from
// Vercel in production (InnerTube's LOGIN_REQUIRED IP block) so the original fix pushed web
// strictly ahead of youtube to keep the dispatch cap from being dominated by failures. YouTube is
// production-viable again now that a failed InnerTube fetch falls back to a Browserbase
// real-browser session (lib/research/fetch/youtube-browserbase.ts) — so it earns back a fair
// share of the cap instead of being starved behind every web URL. Reddit still needs a paid
// Browserbase tier we don't have, so it stays last, doomed or not. Web and YouTube are now
// interleaved (web, youtube, web, youtube, ...) rather than strictly ordered — web stays
// co-equal since it's cheaper and faster (no browser session at all), but neither platform
// gets to eat the whole cap ahead of the other.
function sortByPlatformPriority(urls: string[]): string[] {
  const byPlatform = { web: [] as string[], youtube: [] as string[], reddit: [] as string[] };
  for (const url of urls) {
    byPlatform[detectPlatform(url)].push(url);
  }

  const interleaved: string[] = [];
  const maxLen = Math.max(byPlatform.web.length, byPlatform.youtube.length);
  for (let i = 0; i < maxLen; i++) {
    if (i < byPlatform.web.length) interleaved.push(byPlatform.web[i]);
    if (i < byPlatform.youtube.length) interleaved.push(byPlatform.youtube[i]);
  }
  // Reddit last, in its original discovery order — never interleaved in.
  interleaved.push(...byPlatform.reddit);

  return interleaved;
}

// The actual search + dispatch work, run as a detached tail via waitUntil so the client gets the
// session id (and can start polling/rendering real "queued"/"searching" progress) immediately
// instead of waiting several seconds for the LLM parse + search calls to finish synchronously
// (A4 finding — the old flow never showed those two pipeline steps at all).
async function continueSearch(
  sessionId: string,
  query: string,
  plan: Plan,
  userId: string,
  request: Request
): Promise<void> {
  await prisma.researchSession.update({
    where: { id: sessionId },
    data: { status: "searching" },
  });

  // generateSearchQueries (Groq) can throw on a bad/rate-limited key or a malformed tool-call
  // response. Fall back to a query-only parse and go straight to the "no work to do" failure
  // path instead of leaving the session stuck in "searching" forever.
  let queries: string[] = [];
  let parsed: { product: string; useCase: string; budget: string } = {
    product: query,
    useCase: "",
    budget: "",
  };
  let queryParseFailed = false;

  try {
    const result = await generateSearchQueries(query, plan);
    queries = result.queries;
    parsed = result.parsed;
  } catch {
    queryParseFailed = true;
  }

  let urls: string[] = [];
  let searchFailed = false;

  if (!queryParseFailed) {
    const discovered = await discoverSources(queries, parsed.product || query);
    urls = discovered.urls;
    searchFailed = discovered.searchFailed;
  }

  const noWorkToDo = queryParseFailed || searchFailed || urls.length === 0;
  const failureReason = queryParseFailed
    ? "query_parse_failed"
    : searchFailed
      ? "search_unavailable"
      : urls.length === 0
        ? "no_results"
        : null;

  if (noWorkToDo) {
    await prisma.researchSession.update({
      where: { id: sessionId },
      data: { parsed, status: "failed", expectedSources: 0, failureReason },
    });
    return;
  }

  // Sort before slicing to the cap so web/youtube interleave and reddit falls to the back before
  // the cap-slice — see sortByPlatformPriority above for why.
  urls = sortByPlatformPriority(urls);

  // Keep the full discovered list — the cap-slice below is what gets dispatched immediately,
  // but the overflow (candidates that didn't make the cut) is persisted as "discovered"
  // SourceAttempt rows so the backfill step in process-source/route.ts has real replacement
  // candidates when a dispatched source fails, instead of just shrinking expectedSources.
  const allUrls = urls;
  const dispatchUrls = allUrls.slice(0, sourceCapForPlan(plan));
  const overflowUrls = allUrls.slice(sourceCapForPlan(plan));
  urls = dispatchUrls;

  // The fast quota check in POST (before this tail started) is a cheap early-exit for the common
  // case only — it doesn't close the race between concurrent requests from the same user, since
  // the LLM parse + search calls above take several seconds. Re-check under an advisory lock,
  // scoped to just this check + the status flip (not the search work above, which would hold the
  // lock far too long for no benefit), so at most FREE_MONTHLY_REPORT_LIMIT sessions that
  // actually dispatch work land per user per month (S4 finding). excludeSessionId omits this
  // session's own row — it already exists (status "searching"/"fetching") by the time this
  // re-check runs, so without the exclusion it counts against its own limit.
  if (plan === "free") {
    const flipped = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))`;
      const used = await countReportsThisMonth(userId, tx, sessionId);
      if (used >= FREE_MONTHLY_REPORT_LIMIT) {
        return false;
      }
      await tx.researchSession.update({
        where: { id: sessionId },
        data: { parsed, status: "fetching", expectedSources: urls.length, failureReason: null },
      });
      return true;
    });

    if (!flipped) {
      await prisma.researchSession.update({
        where: { id: sessionId },
        data: { parsed, status: "failed", expectedSources: 0, failureReason: "quota_exceeded" },
      });
      return;
    }
  } else {
    await prisma.researchSession.update({
      where: { id: sessionId },
      data: { parsed, status: "fetching", expectedSources: urls.length, failureReason: null },
    });
  }

  // The audit trail behind the "every site we checked" transparency panel — one row per
  // discovered URL, not just the ones that end up as a linked Source. skipDuplicates guards
  // the @@unique([sessionId, url]) constraint even though discoverSources already dedupes.
  await prisma.sourceAttempt.createMany({
    data: [
      ...dispatchUrls.map((url) => ({
        sessionId,
        url,
        platform: detectPlatform(url),
        status: "dispatched" as const,
      })),
      ...overflowUrls.map((url) => ({
        sessionId,
        url,
        platform: detectPlatform(url),
        status: "discovered" as const,
      })),
    ],
    skipDuplicates: true,
  });

  urls.forEach((url, index) => {
    const target = internalUrl(`/api/research/${sessionId}/process-source`, request);
    waitUntil(
      dispatchInternal(
        target,
        {
          method: "POST",
          headers: internalHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ url }),
        },
        "POST /api/research",
        index * DISPATCH_STAGGER_MS
      )
    );
  });
}

// POST /api/research — creates the session immediately (status "queued") and continues the
// search step as a detached waitUntil tail (see continueSearch) so the client can start polling
// real pipeline progress right away instead of blocking on the LLM parse + search calls.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const query = typeof body?.query === "string" ? body.query.trim() : "";

  if (!query) {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }

  const plan = await getPlanForUser(user.id);
  if (plan === "free") {
    // Independent reads — run together instead of two sequential round-trips (E3 finding).
    // Cheap early-exit for the common case only — see continueSearch for the real quota
    // enforcement, which has to happen after the search work completes.
    const [duplicate, used] = await Promise.all([
      findRecentDuplicateSession(user.id, query),
      countReportsThisMonth(user.id),
    ]);

    if (duplicate) {
      return NextResponse.json({ id: duplicate.id }, { status: 200 });
    }

    if (used >= FREE_MONTHLY_REPORT_LIMIT) {
      return NextResponse.json(
        {
          error: `You've used all ${FREE_MONTHLY_REPORT_LIMIT} free reports this month. Upgrade to Pro for unlimited reports.`,
        },
        { status: 402 }
      );
    }
  }

  const session = await prisma.researchSession.create({
    data: {
      userId: user.id,
      query,
      parsed: { product: query, useCase: "", budget: "" },
      status: "queued",
      expectedSources: 0,
    },
    select: { id: true },
  });

  waitUntil(continueSearch(session.id, query, plan, user.id, request));

  return NextResponse.json({ id: session.id }, { status: 201 });
}
