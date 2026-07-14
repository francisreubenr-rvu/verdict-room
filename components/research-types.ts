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

export interface ResearchFinding {
  id: string;
  sourceId: string;
  option: string;
  claim: string;
  sentiment: Sentiment;
  quote: string;
}

export interface ResearchSessionResponse {
  id: string;
  query: string;
  status: string;
  expectedSources: number;
  verdictJson: VerdictJson | null;
  createdAt: string;
  updatedAt: string;
  sources: ResearchSource[];
  findings: ResearchFinding[];
}

// GET /api/research — one entry per session for the landing page's "Recent research" list
// (PLAN.md §6 M5). Deliberately thinner than ResearchSessionResponse — no sources/findings/
// verdict, just enough to render a linked list row.
export interface ResearchSessionSummary {
  id: string;
  query: string;
  status: string;
  createdAt: string;
}
