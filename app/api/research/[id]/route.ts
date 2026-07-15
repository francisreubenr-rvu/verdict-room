import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { isStale, TERMINAL_STATUSES } from "@/components/research-types";

// GET /api/research/[id] — session state + linked sources, per the contract in
// components/research-types.ts (ResearchSessionResponse). Per-finding detail is never rendered
// by any client (the report shows synthesized Options, the source list shows per-source
// summaries) — omitted from both the query and the response to avoid shipping a growing
// three-table join on every ~2s poll (E1 finding).
export async function GET(
  _request: Request,
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
    include: { sources: { include: { source: true } } },
  });

  if (!session) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // A session stuck in a non-terminal status past the staleness window almost certainly lost a
  // waitUntil hop — reap it here so the client's poll loop terminates instead of running forever
  // (A1 finding).
  let status: string = session.status;
  let failureReason: string | null = session.failureReason;
  if (isStale(session.status, session.updatedAt)) {
    const reaped = await prisma.researchSession.updateMany({
      where: { id: session.id, status: { notIn: TERMINAL_STATUSES } },
      data: { status: "failed", failureReason: "timed_out" },
    });
    if (reaped.count > 0) {
      status = "failed";
      failureReason = "timed_out";
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
  }));

  return NextResponse.json({
    id: session.id,
    query: session.query,
    status,
    expectedSources: session.expectedSources,
    failureReason,
    verdictJson: session.verdictJson,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
    sources,
  });
}
