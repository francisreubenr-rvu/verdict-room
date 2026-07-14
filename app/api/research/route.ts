import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { generateSearchQueries } from "@/lib/llm";
import { googleCustomSearch, GoogleSearchError } from "@/lib/research/search";
import {
  FREE_MONTHLY_REPORT_LIMIT,
  countReportsThisMonth,
  findRecentDuplicateSession,
  getPlanForUser,
} from "@/lib/billing";

// GET /api/research — PLAN.md §6 M5: the current user's research sessions, most recent first,
// for the landing page's "Recent research" list, plus real usage (SITE-REDESIGN-PLAN.md §Stage C)
// so /app can render "X of 3 free reports left" without fabricating a number. Scoped to auth.uid()
// (RLS is the real enforcement once a live Supabase project exists — see the [id] route's same
// defense-in-depth note), hard 401 for unauthenticated callers since this is a listing of private
// history, not a single session lookup.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [sessions, plan, used] = await Promise.all([
    prisma.researchSession.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, query: true, status: true, createdAt: true },
    }),
    getPlanForUser(user.id),
    countReportsThisMonth(user.id),
  ]);

  return NextResponse.json({
    sessions: sessions.map((session) => ({
      id: session.id,
      query: session.query,
      status: session.status,
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
    // Pricing FAQ promise: re-running the same query within 24h is free — return the
    // existing session instead of creating a new one or consuming quota.
    const duplicate = await findRecentDuplicateSession(user.id, query);
    if (duplicate) {
      return NextResponse.json({ id: duplicate.id }, { status: 200 });
    }

    const used = await countReportsThisMonth(user.id);
    if (used >= FREE_MONTHLY_REPORT_LIMIT) {
      return NextResponse.json(
        {
          error: `You've used all ${FREE_MONTHLY_REPORT_LIMIT} free reports this month. Upgrade to Pro for unlimited reports.`,
        },
        { status: 402 }
      );
    }
  }

  const { queries, parsed } = await generateSearchQueries(query);

  let urls: string[] = [];
  let searchFailed = false;

  try {
    const batches = await Promise.all(queries.map((q) => googleCustomSearch(q)));
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
    if (err instanceof GoogleSearchError) {
      searchFailed = true;
    } else {
      throw err;
    }
  }

  // No URLs at all (search failed, or succeeded with zero results) means nothing will ever
  // call process-source, so the session would sit in "fetching" forever — mark it failed now.
  const noWorkToDo = searchFailed || urls.length === 0;

  const session = await prisma.researchSession.create({
    data: {
      userId: user.id,
      query,
      parsed,
      status: noWorkToDo ? "failed" : "fetching",
      expectedSources: noWorkToDo ? 0 : urls.length,
    },
  });

  if (!noWorkToDo) {
    for (const url of urls) {
      const target = new URL(`/api/research/${session.id}/process-source`, request.url);
      waitUntil(
        fetch(target, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        })
      );
    }
  }

  return NextResponse.json({ id: session.id }, { status: 201 });
}
