import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { synthesize, type ParsedQuery, type SynthesisFinding } from "@/lib/llm";
import { assertInternalCaller } from "@/lib/internal-pipeline";

// PLAN.md §3 step 3: final ranking + verdict. Triggered by process-source once all sources for
// a session have completed.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = assertInternalCaller(request);
  if (authError) return authError;

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

  // Only the caller that legitimately reached this step (session in "synthesizing") may write a
  // verdict — a stray/duplicate POST on an already-"done" session would otherwise append a
  // second full set of Options and silently overwrite the existing verdictJson; on a "failed"
  // session it would incorrectly flip it back to "done" (A3 finding).
  if (session.status !== "synthesizing") {
    return NextResponse.json({ ok: true, skipped: true });
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

  // Every dispatched source can succeed (sourceCount > 0, so process-source's own
  // all_sources_failed check never fires) while none of them extracted any findings —
  // extractAndClassify/extractYoutubeReview can legitimately return findings: []. Synthesizing
  // an empty findings array produces a content-free "done" report that still burns a monthly
  // quota slot and blocks the 24h duplicate-retry window, so treat it as a failure instead.
  if (findings.length === 0) {
    await prisma.researchSession.updateMany({
      where: { id: sessionId, status: "synthesizing" },
      data: { status: "failed", failureReason: "no_findings" },
    });
    return NextResponse.json({ ok: true, skipped: true });
  }

  try {
    const result = await synthesize({
      sessionQuery: session.query,
      parsed: session.parsed as unknown as ParsedQuery,
      findings,
    });

    // The tool-call JSON is model output, not a validated contract — a truncated 4096-token
    // response or a model that ignores the schema hint can produce a missing name, a
    // non-integer rank, or missing pros/cons arrays, all of which would otherwise write raw
    // into Postgres (A5 finding).
    const options = result.options.filter(
      (o) =>
        typeof o.name === "string" &&
        o.name.trim().length > 0 &&
        Number.isFinite(o.score) &&
        Array.isArray(o.pros) &&
        Array.isArray(o.cons) &&
        Number.isInteger(o.rank)
    );

    await prisma.$transaction([
      // Defense-in-depth alongside the status="synthesizing" guard above: even if this route
      // somehow runs twice for one session, the second pass replaces rather than duplicates.
      prisma.option.deleteMany({ where: { sessionId } }),
      prisma.option.createMany({
        data: options.map((o) => ({
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
          verdictJson: { options, verdict: result.verdict },
          status: "done",
        },
      }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(`synthesize: failed for session ${sessionId}:`, err);
    await prisma.researchSession.update({
      where: { id: sessionId },
      data: { status: "failed", failureReason: "synthesis_failed" },
    });
    return NextResponse.json({ error: "synthesis failed" }, { status: 500 });
  }
}
