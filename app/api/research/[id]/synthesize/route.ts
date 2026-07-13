import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { synthesize, type ParsedQuery, type SynthesisFinding } from "@/lib/llm";

// PLAN.md §3 step 3: final ranking + verdict. Triggered by process-source once all sources for
// a session have completed.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params;

  const session = await prisma.researchSession.findUnique({
    where: { id: sessionId },
    include: {
      sources: {
        include: {
          source: { include: { findings: true } },
        },
      },
    },
  });

  if (!session) {
    return NextResponse.json({ error: "session not found" }, { status: 404 });
  }

  const findings: SynthesisFinding[] = session.sources.flatMap(({ source }) =>
    source.findings.map((f) => ({
      sourceId: source.id,
      url: source.url,
      platform: source.platform,
      sponsorship: source.sponsorship ?? "organic",
      option: f.option,
      claim: f.claim,
      sentiment: f.sentiment,
      quote: f.quote,
    }))
  );

  try {
    const result = await synthesize({
      sessionQuery: session.query,
      parsed: session.parsed as unknown as ParsedQuery,
      findings,
    });

    await prisma.$transaction([
      prisma.option.createMany({
        data: result.options.map((o) => ({
          sessionId,
          name: o.name,
          score: o.score,
          pros: o.pros,
          cons: o.cons,
          rank: o.rank,
        })),
      }),
      prisma.researchSession.update({
        where: { id: sessionId },
        data: {
          verdictJson: { options: result.options, verdict: result.verdict },
          status: "done",
        },
      }),
    ]);

    return NextResponse.json({ ok: true });
  } catch {
    await prisma.researchSession.update({
      where: { id: sessionId },
      data: { status: "failed" },
    });
    return NextResponse.json({ error: "synthesis failed" }, { status: 500 });
  }
}
