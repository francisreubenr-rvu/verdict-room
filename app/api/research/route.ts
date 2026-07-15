import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { generateSearchQueries } from "@/lib/llm";
import { webSearch, youtubeSearch, SearchProviderError } from "@/lib/research/search";
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
  await prisma.researchSession.updateMany({
    where: {
      userId: user.id,
      status: { notIn: TERMINAL_STATUSES },
      updatedAt: { lt: new Date(Date.now() - STALE_SESSION_MS) },
    },
    data: { status: "failed", failureReason: "timed_out" },
  });

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

  const ytResults = await youtubeSearch(`${productTerm} review`);
  for (const result of ytResults) {
    if (!seen.has(result.url)) {
      seen.add(result.url);
      urls.push(result.url);
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
const DISPATCH_STAGGER_MS = 1200;

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
    const result = await generateSearchQueries(query);
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

  urls = urls.slice(0, sourceCapForPlan(plan));

  // The fast quota check in POST (before this tail started) is a cheap early-exit for the common
  // case only — it doesn't close the race between concurrent requests from the same user, since
  // the LLM parse + search calls above take several seconds. Re-check under an advisory lock,
  // scoped to just this check + the status flip (not the search work above, which would hold the
  // lock far too long for no benefit), so at most FREE_MONTHLY_REPORT_LIMIT sessions that
  // actually dispatch work land per user per month (S4 finding).
  if (plan === "free") {
    const flipped = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))`;
      const used = await countReportsThisMonth(userId, tx);
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
