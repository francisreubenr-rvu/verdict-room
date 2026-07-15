import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { generateSearchQueries } from "@/lib/llm";
import { webSearch, SearchProviderError } from "@/lib/research/search";
import { internalHeaders, internalUrl } from "@/lib/internal-pipeline";
import { STALE_SESSION_MS, TERMINAL_STATUSES } from "@/components/research-types";
import {
  FREE_MONTHLY_REPORT_LIMIT,
  countReportsThisMonth,
  findRecentDuplicateSession,
  getPlanForUser,
} from "@/lib/billing";

// GET /api/research — PLAN.md §6 M5: the current user's research sessions, most recent first,
// for the landing page's "Recent research" list, plus real usage (SITE-REDESIGN-PLAN.md §Stage C)
// so /app can render "X of 3 free reports left" without fabricating a number. Scoped to userId
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

// POST /api/research — PLAN.md §3 step 1 (search, inline) + kicks off step 2 (fetch+extract+
// classify, one process-source call per URL) via waitUntil so the client isn't blocked on it.
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
    // This is a cheap early-exit for the common case only, not the real quota enforcement — it
    // does not close the race between concurrent requests (see the advisory-lock re-check right
    // before session creation below, S4 finding).
    const [duplicate, used] = await Promise.all([
      findRecentDuplicateSession(user.id, query),
      countReportsThisMonth(user.id),
    ]);

    // Pricing FAQ promise: re-running the same query within 24h is free — return the
    // existing session instead of creating a new one or consuming quota.
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

  // generateSearchQueries (Groq) can throw on a bad/rate-limited key or a malformed tool-call
  // response — left uncaught, that aborts the handler before any session row exists, so a
  // failed query never shows up in "recent research" and leaves no record to debug from. Fall
  // back to a query-only parse and go straight to the "no work to do" failure path instead.
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
    try {
      const batches = await Promise.all(queries.map((q) => webSearch(q)));
      const seen = new Set<string>();
      for (const batch of batches) {
        for (const result of batch) {
          if (!seen.has(result.url)) {
            seen.add(result.url);
            urls.push(result.url);
          }
        }
      }
      urls = urls.slice(0, 12); // PLAN.md §3 source cap
    } catch (err) {
      if (err instanceof SearchProviderError) {
        searchFailed = true;
      } else {
        throw err;
      }
    }
  }

  // No URLs at all (query parsing failed, search failed, or search succeeded with zero
  // results) means nothing will ever call process-source, so the session would sit in
  // "fetching" forever — mark it failed now.
  const noWorkToDo = queryParseFailed || searchFailed || urls.length === 0;
  const failureReason = queryParseFailed
    ? "query_parse_failed"
    : searchFailed
      ? "search_unavailable"
      : urls.length === 0
        ? "no_results"
        : null;

  const sessionData = {
    userId: user.id,
    query,
    parsed,
    status: noWorkToDo ? "failed" : "fetching",
    expectedSources: noWorkToDo ? 0 : urls.length,
    failureReason,
  };

  // The quota check above (count-then-compare) and the actual insert are several awaits apart
  // (a full LLM call + parallel search requests) — concurrent requests from the same user can
  // all read a pre-limit count and all pass. An advisory lock scoped to this user serializes
  // just the re-check + insert (not the preceding LLM/search calls, which would hold the lock
  // far too long for no benefit), so at most FREE_MONTHLY_REPORT_LIMIT sessions that actually
  // dispatch work land per user per month (S4 finding). Failed sessions don't count against
  // quota (see billing.ts), so only the real-work path needs the guard.
  let session: { id: string };
  if (plan === "free" && !noWorkToDo) {
    const created = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${user.id}, 0))`;
      const used = await countReportsThisMonth(user.id, tx);
      if (used >= FREE_MONTHLY_REPORT_LIMIT) {
        return null;
      }
      return tx.researchSession.create({ data: sessionData, select: { id: true } });
    });

    if (!created) {
      return NextResponse.json(
        {
          error: `You've used all ${FREE_MONTHLY_REPORT_LIMIT} free reports this month. Upgrade to Pro for unlimited reports.`,
        },
        { status: 402 }
      );
    }
    session = created;
  } else {
    session = await prisma.researchSession.create({ data: sessionData, select: { id: true } });
  }

  if (!noWorkToDo) {
    for (const url of urls) {
      const target = internalUrl(`/api/research/${session.id}/process-source`, request);
      waitUntil(
        fetch(target, {
          method: "POST",
          headers: internalHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ url }),
        })
      );
    }
  }

  return NextResponse.json({ id: session.id }, { status: 201 });
}
