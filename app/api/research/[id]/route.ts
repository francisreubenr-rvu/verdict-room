import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

// GET /api/research/[id] — session state + linked sources + findings, per the contract in
// components/research-types.ts (ResearchSessionResponse).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // PLAN.md §4a: RLS is the real enforcement once a live Supabase project exists. This
  // userId filter is defense in depth only — no hard 401 for an unauthenticated caller, since
  // that's not part of this milestone's scope.
  const session = await prisma.researchSession.findFirst({
    where: user ? { id, userId: user.id } : { id },
    include: {
      sources: {
        include: {
          source: { include: { findings: true } },
        },
      },
    },
  });

  if (!session) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
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

  const findings = session.sources.flatMap(({ source }) =>
    source.findings.map((f) => ({
      id: f.id,
      sourceId: f.sourceId,
      option: f.option,
      claim: f.claim,
      sentiment: f.sentiment,
      quote: f.quote,
    }))
  );

  return NextResponse.json({
    id: session.id,
    query: session.query,
    status: session.status,
    expectedSources: session.expectedSources,
    verdictJson: session.verdictJson,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
    sources,
    findings,
  });
}
