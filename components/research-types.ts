// Shared shape for the research session API responses (GET /api/research/[id]
// per PLAN.md §5, §4). Mirrors the Prisma models in prisma/schema.prisma —
// the API-routes workstream must return exactly this shape.

export type Platform = "youtube" | "reddit" | "web";
export type Sponsorship = "organic" | "sponsored" | "affiliate";
export type Sentiment = "pro" | "con" | "neutral";

// Non-terminal pipeline stages, in the order they run (PLAN.md §3).
export const PIPELINE_STEPS = [
  "queued",
  "searching",
  "fetching",
  "extracting",
  "synthesizing",
] as const;

export type PipelineStep = (typeof PIPELINE_STEPS)[number];

// Not `as const`, deliberately: consumers (e.g. process-source/route.ts's Prisma `notIn` filter)
// need a plain mutable string[], and nothing here relies on the narrower literal tuple type.
export const TERMINAL_STATUSES: string[] = ["done", "failed"];

export function isTerminalStatus(status: string): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export interface ResearchOption {
  name: string;
  score: number;
  pros: string[];
  cons: string[];
  rank: number;
}

export interface VerdictJson {
  options: ResearchOption[];
  verdict: string;
}

export interface ResearchSource {
  id: string;
  url: string;
  platform: Platform;
  author: string | null;
  sponsorship: Sponsorship | null;
  sponsorConfidence: number | null;
  summary: string | null;
}

// Failure reasons written by the pipeline (app/api/research/**) when status="failed". Kept as a
// plain string union rather than a Prisma enum since it's diagnostic metadata, not a modeled
// entity relationship — new reasons can be added without a migration.
export type FailureReason =
  | "query_parse_failed"
  | "search_unavailable"
  | "no_results"
  | "all_sources_failed"
  | "synthesis_failed"
  | "timed_out"
  | "quota_exceeded";

export const FAILURE_MESSAGES: Record<FailureReason, string> = {
  query_parse_failed: "Couldn't understand that query. Try rephrasing it.",
  search_unavailable: "Search is temporarily unavailable. Please try again shortly.",
  no_results: "No sources found for that query. Try being more specific.",
  all_sources_failed: "Every source we found failed to load. Please try again.",
  synthesis_failed: "We gathered sources but couldn't finish the report. Please try again.",
  timed_out: "This is taking too long. Please try again.",
  quota_exceeded: "You're out of free reports this month. Upgrade to Pro for unlimited reports.",
};

// A session stuck in a non-terminal status this long almost certainly lost a `waitUntil` hop
// (dropped on deploy rollover, function teardown, etc.) rather than being genuinely in
// progress — the pipeline's own steps each complete in well under a minute. Any read path can
// use this to reap a stale session instead of leaving the client polling forever.
export const STALE_SESSION_MS = 10 * 60 * 1000;

export function isStale(status: string, updatedAt: Date): boolean {
  return !isTerminalStatus(status) && Date.now() - updatedAt.getTime() > STALE_SESSION_MS;
}

export interface ResearchSessionResponse {
  id: string;
  query: string;
  status: string;
  expectedSources: number;
  failureReason: string | null;
  verdictJson: VerdictJson | null;
  createdAt: string;
  updatedAt: string;
  sources: ResearchSource[];
}

// GET /api/research — one entry per session for the landing page's "Recent research" list
// (PLAN.md §6 M5). Deliberately thinner than ResearchSessionResponse — no sources/findings/
// verdict, just enough to render a linked list row.
export interface ResearchSessionSummary {
  id: string;
  query: string;
  status: string;
  failureReason: string | null;
  createdAt: string;
}
