// The Verdict Room — Groq wrapper (search-query generation, extract+classify, synthesis).
// Pure pipeline logic: no Prisma/DB calls in this file. Per PLAN.md §3, all three calls use one
// model and structured output (forced function-calling) so downstream shapes are reliable.
//
// Changed 2026-07-15 twice: Claude Sonnet -> DeepSeek -> Groq (free-tier API keys), all same-day,
// all user preference rather than an architectural driver. Groq's API is OpenAI-compatible too,
// so this is still OpenAI-style tool/function-calling — only the base URL, API key, and model
// name changed from the DeepSeek version.

import OpenAI from "openai";

// Lazy singleton — constructing eagerly at module load crashes Next.js's build-time page-data
// collection (which imports every route module) when neither key is set yet, e.g. no
// .env.local. Matches lib/stripe.ts's getStripe() pattern.
let client: OpenAI | undefined;

// Env-driven LLM provider. Both Groq and NVIDIA NIM are OpenAI-compatible and both host
// openai/gpt-oss-120b, so switching is purely a base-URL + key swap (no prompt/tool changes).
// NVIDIA is preferred when NVIDIA_API_KEY is present: its free tier is request-rate limited
// (~40 req/min) rather than Groq's tight 8000 tokens/min cap, and that TPM cap is what starves the
// large synthesize() call once a session's extraction storm has drained the shared bucket
// (2026-07-23 incident, see SOURCING-PLAN.md). Groq remains the fallback when only GROQ_API_KEY
// is set, so this is a config-only switch with no behavior change until the NVIDIA key is added.
function getLlm(): OpenAI {
  if (!client) {
    client = process.env.NVIDIA_API_KEY
      ? new OpenAI({
          apiKey: process.env.NVIDIA_API_KEY,
          baseURL: "https://integrate.api.nvidia.com/v1",
        })
      : new OpenAI({
          apiKey: process.env.GROQ_API_KEY,
          baseURL: "https://api.groq.com/openai/v1",
        });
  }
  return client;
}

// openai/gpt-oss-120b — an open-weight reasoning model with native tool-use/function-calling,
// hosted on BOTH providers this file can target (Groq and NVIDIA NIM) under the same id, so the
// provider switch above needs no model change. Groq's free tier is 8K tokens/min (the synthesize
// bottleneck); NVIDIA's free tier is ~40 req/min with no comparable per-minute token cap.
const MODEL = "openai/gpt-oss-120b";

export type ParsedQuery = {
  product: string;
  useCase: string;
  budget: string;
};

export type Sentiment = "pro" | "con" | "neutral";
export type Sponsorship = "organic" | "sponsored" | "affiliate";
export type Platform = "youtube" | "reddit" | "web";

const SENTIMENT_VALUES: readonly Sentiment[] = ["pro", "con", "neutral"];
const SPONSORSHIP_VALUES: readonly Sponsorship[] = ["organic", "sponsored", "affiliate"];

// Forced tool-call responses are reliable but not guaranteed-valid JSON Schema conformance.
// `sponsorship` and `sentiment` get written straight into Postgres enum columns (Prisma throws a
// validation error on an out-of-range value, but with a message that's opaque about *which* LLM
// call produced it) — a cheap, explicit check here fails with a clearer error at the source
// instead of relying on that downstream throw.
function assertSentiment(value: unknown, context: string): asserts value is Sentiment {
  if (!SENTIMENT_VALUES.includes(value as Sentiment)) {
    throw new Error(`${context}: invalid sentiment value ${JSON.stringify(value)}`);
  }
}

function assertSponsorship(value: unknown, context: string): asserts value is Sponsorship {
  if (!SPONSORSHIP_VALUES.includes(value as Sponsorship)) {
    throw new Error(`${context}: invalid sponsorship value ${JSON.stringify(value)}`);
  }
}

// Every call in this file forces exactly one named tool and expects exactly one tool_call back —
// this centralizes the "grab it and JSON.parse the arguments string" step shared by all three.
function parseForcedToolCall<T>(
  message: OpenAI.Chat.Completions.ChatCompletionMessage,
  toolName: string,
  context: string
): T {
  const call = message.tool_calls?.find(
    (c): c is OpenAI.Chat.Completions.ChatCompletionMessageFunctionToolCall =>
      c.type === "function" && c.function.name === toolName
  );
  if (!call) {
    throw new Error(`${context}: model did not return a tool call for ${toolName}`);
  }
  return JSON.parse(call.function.arguments) as T;
}

export type Finding = {
  option: string;
  claim: string;
  sentiment: Sentiment;
  quote: string;
};

/**
 * Step 1 of PLAN.md §3: one LLM call that parses the natural-language query into
 * {product, useCase, budget} and generates targeted search query strings covering the
 * product name, "best X review", "X reddit", "X problems/complaints", and "X sponsored review"
 * patterns. Free sessions keep the original 3-5 query bound; Pro sessions ask for up to 10 —
 * the 50-source Pro cap needs a wide enough candidate pool to actually approach, not just a
 * higher cap number with the same handful of queries feeding it.
 */
export async function generateSearchQueries(
  query: string,
  plan: "free" | "pro" = "free"
): Promise<{ queries: string[]; parsed: ParsedQuery }> {
  const toolName = "emit_search_plan";
  const maxQueries = plan === "pro" ? 10 : 5;

  const response = await getLlm().chat.completions.create({
    model: MODEL,
    max_tokens: 1024,
    tools: [
      {
        type: "function",
        function: {
          name: toolName,
          description:
            "Emit the parsed shopper query and a set of targeted search engine queries to research it.",
          parameters: {
            type: "object",
            properties: {
              parsed: {
                type: "object",
                description: "The natural-language query broken into structured fields.",
                properties: {
                  product: {
                    type: "string",
                    description: "The product or product category being researched.",
                  },
                  useCase: {
                    type: "string",
                    description:
                      "The stated or implied use case/context (e.g. 'travel', 'gaming'). Empty string if none stated.",
                  },
                  budget: {
                    type: "string",
                    description:
                      "The stated budget constraint as free text (e.g. 'under $300'). Empty string if none stated.",
                  },
                },
                required: ["product", "useCase", "budget"],
              },
              queries: {
                type: "array",
                description: `3 to ${maxQueries} targeted search engine query strings: the bare product name, a 'best X review' style query, an 'X reddit' query, an 'X problems' or 'X complaints' query, an 'X sponsored review' style query, and (space permitting) additional angles like specific competing models, use-case-specific phrasing, and forum/community terms. Tailor wording to the parsed product/useCase/budget.`,
                items: { type: "string" },
                minItems: 3,
                maxItems: maxQueries,
              },
            },
            required: ["parsed", "queries"],
          },
        },
      },
    ],
    tool_choice: { type: "function", function: { name: toolName } },
    messages: [
      {
        role: "user",
        content: `Shopper query: "${query}"\n\nParse this query and generate a search plan per the tool schema.`,
      },
    ],
  });

  const input = parseForcedToolCall<{ queries: string[]; parsed: ParsedQuery }>(
    response.choices[0].message,
    toolName,
    "generateSearchQueries"
  );
  // The item-count bound is a schema *hint*, not an enforced constraint — a model that ignores
  // it fires one extra Jina Search call per extra query, eating into the shared Jina token pool.
  return { queries: input.queries.slice(0, maxQueries), parsed: input.parsed };
}

// Groq's 429s carry a real `retry-after` header (2-38s observed in production, 2026-07-19 incident
// — see SOURCING-PLAN.md) driven by the token-window reset, not a flat "try again shortly." A
// fixed ~1.5s wait is useless against a 38s reset — the retry just fails again. Read the real
// wait off the error and honor it (capped) instead of guessing.
const FALLBACK_RETRY_DELAY_MS = 5000;
const MAX_RETRY_DELAY_MS = 40 * 1000;

function retryAfterMsFromError(err: unknown): number {
  // The openai SDK's APIError exposes the raw response `headers` (a standard `Headers` object) —
  // mirrors how `status` is read below defensively, since a non-APIError thrown value won't have
  // either property.
  const headers = (err as { headers?: Headers } | null)?.headers;
  const headerValue = headers?.get?.("retry-after");
  if (headerValue) {
    const seconds = Number(headerValue);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return seconds * 1000;
    }
  }

  // Defensive fallback: Groq's 429 error message body also states the wait inline (e.g. "Please
  // try again in 38.5s") — parse it when the header is missing or unparseable.
  const message = (err as { message?: string } | null)?.message ?? "";
  const match = message.match(/try again in ([\d.]+)\s*(ms|s)?/i);
  if (match) {
    const value = Number(match[1]);
    const unit = (match[2] ?? "s").toLowerCase();
    if (Number.isFinite(value)) {
      return unit === "ms" ? value : value * 1000;
    }
  }

  return FALLBACK_RETRY_DELAY_MS;
}

// Used by both extractAndClassify (up to 50 calls for a Pro session, staggered ~1.2s apart —
// see DISPATCH_STAGGER_MS in app/api/research/route.ts) and synthesize (once per session, but
// its prompt scales with source count too). Only retries 429 (genuine transient rate limiting) —
// deliberately not 413 "Request too large": that means the request itself is oversized, and
// retrying the identical payload would just fail identically. Up to 2 retries (3 attempts total),
// each waiting the real retry-after window (plus a little jitter, capped at 40s) instead of a
// single flat guess — see retryAfterMsFromError above.
// opts lets the once-per-session synthesize call retry more patiently than the per-source
// extraction calls (2026-07-23): synthesize runs AFTER the extraction storm has drained the 8000
// TPM bucket, so its token-429 needs to wait out a full ~50s bucket refill, sometimes more than
// once as stragglers contend. The default (2 retries, 40s cap) stays right for extraction, where
// dozens of calls are in flight and long waits would just clog the pipeline. The synthesize call
// passes a higher maxRetries/maxDelayMs; total wait stays well under the route's 300s budget.
async function withRateLimitRetry<T>(
  fn: () => Promise<T>,
  opts?: { maxRetries?: number; maxDelayMs?: number }
): Promise<T> {
  const MAX_RETRIES = opts?.maxRetries ?? 2;
  const maxDelayMs = opts?.maxDelayMs ?? MAX_RETRY_DELAY_MS;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const status = (err as { status?: number } | null)?.status;
      if (status !== 429 || attempt >= MAX_RETRIES) throw err;
      const waitMs = Math.min(retryAfterMsFromError(err) + 1000 + Math.random() * 1000, maxDelayMs);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
}

/**
 * Step 2 of PLAN.md §3: the merged extract+classify LLM call, run once per fetched source.
 * Extracts option-level findings (claim/sentiment/quote) and classifies the source's
 * sponsorship posture (organic/sponsored/affiliate) with a confidence score.
 *
 * Findings capped at 12 (schema `maxItems`) with claim/quote length-guided to ~100 chars each —
 * confirmed live 2026-07-17: a many-product roundup/listicle source (e.g. a "10 best keyboards
 * under $100" article) generates enough findings to exhaust the 2000-token output budget
 * mid-JSON, producing a truncated tool-call argument string that fails to parse (a real, observed
 * 400 "Failed to parse tool call arguments as JSON"). This got materially more likely once the
 * widened source discovery (2026-07-16) started actually surfacing this kind of content instead
 * of stalling out around 6-8 sources. `maxItems` alone wasn't enough — a second live run still
 * truncated with as few as 5 findings when the model wrote long, verbatim quotes instead of short
 * paraphrases, so the description now explicitly bounds string length too, not just count.
 * Bounding findings per source here also shrinks synthesize()'s aggregate input, see its own
 * MAX_FINDINGS/MAX_FIELD_CHARS comment for the matching downstream tightening.
 */
export async function extractAndClassify(input: {
  url: string;
  platform: Platform;
  content: string;
}): Promise<{
  findings: Finding[];
  sponsorship: Sponsorship;
  sponsorConfidence: number;
  summary: string;
  author: string | null;
}> {
  const toolName = "emit_extraction";

  // Reduced from 4096 2026-07-15: Groq's 8K TPM ceiling appears to count reserved output budget
  // toward the same limit as prompt tokens, so a generous max_tokens was eating into the same
  // headroom MAX_CONTENT_CHARS (lib/research/extract.ts) was trying to protect — confirmed live
  // via real 413 "Request too large" errors. Findings are short structured JSON; 2000 is ample.
  const requestOptions: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
    model: MODEL,
    max_tokens: 2000,
    tools: [
      {
        type: "function",
        function: {
          name: toolName,
          description:
            "Emit structured findings extracted from a review source, plus a sponsorship classification for the source as a whole.",
          parameters: {
            type: "object",
            properties: {
              findings: {
                type: "array",
                description:
                  "The 12 most significant, distinct claims made about specific product options in this source — one entry per distinct claim. For a roundup/listicle covering many products, prioritize breadth (one strong claim per product) over exhaustively covering any single one.",
                items: {
                  type: "object",
                  properties: {
                    option: {
                      type: "string",
                      description: "The specific product/model name this claim is about, free text.",
                    },
                    claim: {
                      type: "string",
                      description: "A concise statement of the claim being made — one short sentence, under 100 characters.",
                    },
                    sentiment: {
                      type: "string",
                      enum: ["pro", "con", "neutral"],
                    },
                    quote: {
                      type: "string",
                      description:
                        "A short supporting quote or paraphrase pulled from the source content — under 100 characters, trimmed to the essential phrase, not the full sentence it came from.",
                    },
                  },
                  required: ["option", "claim", "sentiment", "quote"],
                },
                maxItems: 12,
              },
              sponsorship: {
                type: "string",
                enum: ["organic", "sponsored", "affiliate"],
                description:
                  "organic: no compensation disclosed or evident. sponsored: paid placement/sponsorship disclosed or evident. affiliate: affiliate links/commission disclosed or evident.",
              },
              sponsorConfidence: {
                type: "number",
                description: "Confidence in the sponsorship classification, from 0 to 1.",
              },
              summary: {
                type: "string",
                description: "A one to three sentence summary of what this source covers.",
              },
              author: {
                type: ["string", "null"],
                description: "The author, channel, or publisher name if identifiable in the content, else null.",
              },
            },
            required: ["findings", "sponsorship", "sponsorConfidence", "summary", "author"],
          },
        },
      },
    ],
    tool_choice: { type: "function", function: { name: toolName } },
    messages: [
      {
        role: "user",
        content: `Source URL: ${input.url}\nPlatform: ${input.platform}\n\nContent:\n${input.content}\n\nExtract findings and classify sponsorship per the tool schema.`,
      },
    ],
  };

  const response = await withRateLimitRetry(() => getLlm().chat.completions.create(requestOptions));

  const parsed = parseForcedToolCall<{
    findings: Finding[];
    sponsorship: Sponsorship;
    sponsorConfidence: number;
    summary: string;
    author: string | null;
  }>(response.choices[0].message, toolName, "extractAndClassify");

  // Guard the two fields that get written straight into Postgres enum columns downstream.
  assertSponsorship(parsed.sponsorship, "extractAndClassify");
  for (const finding of parsed.findings) {
    assertSentiment(finding.sentiment, "extractAndClassify finding");
  }

  return {
    ...parsed,
    // The schema asks for 0-1 but doesn't enforce it — an out-of-range value would render as
    // e.g. "700%" confidence in the UI (source-list.tsx).
    sponsorConfidence: Math.min(1, Math.max(0, parsed.sponsorConfidence)),
  };
}

/**
 * YouTube-specific version of the merged extract+classify call above, added 2026-07-16 for the
 * "streamline the YouTube pipeline" request: transcribe -> script -> verify -> pain/good points
 * -> review. Deliberately one merged Groq call, not a 4-call chain (user decision — Groq's free
 * tier is already tight against 15/50-source sessions; a per-video 4x call multiplier would make
 * that meaningfully worse). The "script" and "verify" steps are folded into this call's
 * instructions rather than separate round-trips: the model is told to reconstruct a coherent
 * narrative from the raw (unpunctuated, unsegmented) transcript, but to self-report how well
 * grounded its extracted points actually are rather than inventing claims to fill gaps.
 */
export async function extractYoutubeReview(input: {
  url: string;
  transcript: string;
}): Promise<{
  findings: Finding[];
  sponsorship: Sponsorship;
  sponsorConfidence: number;
  summary: string;
  author: string | null;
  reviewDraft: string;
  groundednessConfidence: number;
}> {
  const toolName = "emit_youtube_review";

  // 2500 vs extractAndClassify's 2000 — this call produces everything extractAndClassify does
  // PLUS reviewDraft (a 3-6 sentence paragraph), so it needs real extra output headroom or the
  // reviewDraft field is what gets cut off mid-string (confirmed live 2026-07-17). Findings are
  // capped tighter (8 vs extractAndClassify's 12) for the same reason, in the other direction —
  // leaving room for that paragraph without the whole call needing an even bigger budget that
  // would risk tripping Groq's 8K TPM admission ceiling once prompt tokens are added in.
  const requestOptions: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
    model: MODEL,
    max_tokens: 2500,
    tools: [
      {
        type: "function",
        function: {
          name: toolName,
          description:
            "Reconstruct a coherent review from a raw YouTube caption transcript: extract pain points and good points per product option, classify sponsorship, and write a short synthesized review — all strictly grounded in what the transcript actually says.",
          parameters: {
            type: "object",
            properties: {
              findings: {
                type: "array",
                description:
                  "The 8 most significant, distinct pain points (sentiment: con) and good points (sentiment: pro) about specific product options mentioned in this video, each traceable to something actually said in the transcript. For a video comparing many products, prioritize breadth (one strong point per product) over exhaustively covering any single one.",
                items: {
                  type: "object",
                  properties: {
                    option: {
                      type: "string",
                      description: "The specific product/model name this claim is about, free text.",
                    },
                    claim: {
                      type: "string",
                      description:
                        "A concise statement of the pain point or good point being made — one short sentence, under 100 characters.",
                    },
                    sentiment: {
                      type: "string",
                      enum: ["pro", "con", "neutral"],
                      description: "pro = good point, con = pain point, neutral = neither.",
                    },
                    quote: {
                      type: "string",
                      description:
                        "A short supporting quote or paraphrase pulled from the transcript — under 100 characters, trimmed to the essential phrase, not the full sentence it came from.",
                    },
                  },
                  required: ["option", "claim", "sentiment", "quote"],
                },
                // Tighter than extractAndClassify's 12 — see the max_tokens comment above for why
                // this call needs to leave more headroom (the reviewDraft field). Confirmed live
                // 2026-07-17 that an unbounded findings list, or long unbounded claim/quote text
                // even at a lower count, can exhaust the output budget mid-JSON and fail to parse.
                maxItems: 8,
              },
              sponsorship: {
                type: "string",
                enum: ["organic", "sponsored", "affiliate"],
                description:
                  "organic: no compensation disclosed or evident. sponsored: paid placement/sponsorship disclosed or evident (e.g. 'thanks to X for sponsoring'). affiliate: affiliate links/commission disclosed or evident.",
              },
              sponsorConfidence: {
                type: "number",
                description: "Confidence in the sponsorship classification, from 0 to 1.",
              },
              summary: {
                type: "string",
                description: "A one to three sentence summary of what this video covers.",
              },
              author: {
                type: ["string", "null"],
                description: "The channel name if identifiable in the transcript content, else null.",
              },
              reviewDraft: {
                type: "string",
                description:
                  "A short (3 to 6 sentence) synthesized review of this specific video's take — what it concluded, its strongest pain points and good points, written in plain language a shopper can quickly read instead of watching the whole video.",
              },
              groundednessConfidence: {
                type: "number",
                description:
                  "Honest 0 to 1 confidence that the findings and review above are well-supported by the actual transcript content, not invented to fill gaps. Lower this (not the findings themselves) when the transcript is short, garbled, mostly unrelated to product opinions (e.g. an ad-only intro), or ambiguous — never fabricate a claim just to raise this score.",
              },
            },
            required: [
              "findings",
              "sponsorship",
              "sponsorConfidence",
              "summary",
              "author",
              "reviewDraft",
              "groundednessConfidence",
            ],
          },
        },
      },
    ],
    tool_choice: { type: "function", function: { name: toolName } },
    messages: [
      {
        role: "user",
        content: `YouTube video URL: ${input.url}\n\nRaw caption transcript (unpunctuated, unsegmented — reconstruct the sense of it yourself):\n${input.transcript}\n\nExtract pain/good points, classify sponsorship, and write a review per the tool schema.`,
      },
    ],
  };

  const response = await withRateLimitRetry(() => getLlm().chat.completions.create(requestOptions));

  const parsed = parseForcedToolCall<{
    findings: Finding[];
    sponsorship: Sponsorship;
    sponsorConfidence: number;
    summary: string;
    author: string | null;
    reviewDraft: string;
    groundednessConfidence: number;
  }>(response.choices[0].message, toolName, "extractYoutubeReview");

  assertSponsorship(parsed.sponsorship, "extractYoutubeReview");
  for (const finding of parsed.findings) {
    assertSentiment(finding.sentiment, "extractYoutubeReview finding");
  }

  return {
    ...parsed,
    sponsorConfidence: Math.min(1, Math.max(0, parsed.sponsorConfidence)),
    groundednessConfidence: Math.min(1, Math.max(0, parsed.groundednessConfidence)),
  };
}

export type SynthesisFinding = {
  sourceId: string;
  url: string;
  platform: string;
  sponsorship: string;
  option: string;
  claim: string;
  sentiment: string;
  quote: string;
};

/**
 * Step 3 of PLAN.md §3: the synthesis LLM call. Canonicalizes free-text `option` values across
 * all findings into ranked Option entries, and writes a plain-language verdict. Per PLAN.md's
 * cost/policy table, sponsored/affiliate findings are NOT counted toward consensus ranking —
 * they are surfaced separately in the verdict as a "what sponsored sources said" note.
 */
export type SynthesizedOption = {
  name: string;
  score: number;
  pros: string[];
  cons: string[];
  rank: number;
  // Budget honesty (2026-07-19 brief): true only when this option's typical price genuinely
  // exceeds the shopper's stated budget — false whenever no budget was stated at all.
  overBudget: boolean;
  // Approximate price plus its relation to the stated budget (e.g. "$549, over your $500
  // budget"), or "" when the findings gave no price evidence for this option.
  priceNote: string;
  // Finding URLs that support this option — validated below against the findings actually sent
  // to the model, so a hallucinated URL can never reach the client.
  sourceUrls: string[];
};

const MAX_SOURCE_URLS_PER_OPTION = 6;

export async function synthesize(input: {
  sessionQuery: string;
  parsed: ParsedQuery;
  findings: SynthesisFinding[];
}): Promise<{
  options: SynthesizedOption[];
  verdict: string;
}> {
  const toolName = "emit_synthesis";

  // Confirmed live 2026-07-15: this prompt scales with source count, and a real session (28
  // dispatched sources) hit the same Groq 8K TPM 413 error extract+classify was hitting —
  // synthesis has no earlier truncation step to shrink it, since it aggregates every finding
  // from every processed source. Cap total findings and truncate each one's free-text fields so
  // the prompt stays bounded regardless of how many sources a Pro session processes. Organic
  // findings are kept first since those are what actually drives ranking; non-organic is only
  // ever a supplementary note in the verdict, so it can be trimmed harder.
  //
  // Tightened twice 2026-07-17: 60/240 hit a real 413 ("Requested 11026" vs the 8000 limit) once
  // widened source discovery started delivering 14+ successful sources per session instead of
  // 6-8. Cutting to 40/180 closed most of the gap but a second live run still overshot by a
  // smaller margin ("Requested 8282"). Cut again to 32/150 for real margin instead of nickel-
  // and-diming this against paid API calls on every iteration.
  // Reduced 32 -> 24 (2026-07-23): the synthesis prompt scales with total findings, and a smaller
  // prompt both eases Groq's 8000 TPM admission after the extraction storm and gives the model
  // fewer distinct products to want to enumerate (the emit_synthesis output is capped at 5 options
  // below, but a shorter candidate list makes it converge on the strongest ones instead of
  // truncating a long one).
  const MAX_FINDINGS = 18;
  const MAX_FIELD_CHARS = 150;
  const truncate = (s: string) => (s.length > MAX_FIELD_CHARS ? `${s.slice(0, MAX_FIELD_CHARS)}…` : s);
  const shrink = (f: SynthesisFinding): SynthesisFinding => ({
    ...f,
    claim: truncate(f.claim),
    quote: truncate(f.quote),
  });

  const allOrganic = input.findings.filter((f) => f.sponsorship === "organic").map(shrink);
  const allNonOrganic = input.findings.filter((f) => f.sponsorship !== "organic").map(shrink);
  const organicFindings = allOrganic.slice(0, MAX_FINDINGS);
  const nonOrganicFindings = allNonOrganic.slice(0, Math.max(0, MAX_FINDINGS - organicFindings.length));

  const response = await withRateLimitRetry(() =>
    getLlm().chat.completions.create({
    model: MODEL,
    // 2200 (2026-07-23): a top-5 shortlist with 3 pros/cons each outputs ~1500 tokens, so this
    // leaves margin against truncation while keeping the request's admission footprint
    // (prompt + max_tokens) small enough to pass the 8000 TPM check on a post-extraction bucket.
    max_tokens: 2200,
    tools: [
      {
        type: "function",
        function: {
          name: toolName,
          description:
            "Emit a canonicalized, ranked list of product options synthesized from organic findings, plus a plain-language verdict that separately notes what sponsored/affiliate sources said. Options priced beyond the shopper's stated budget may still be included when genuinely compelling — but every such option MUST be flagged overBudget with a priceNote explaining the gap. Never mix an over-budget option in unmarked alongside in-budget ones.",
          parameters: {
            type: "object",
            properties: {
              options: {
                type: "array",
                // Bounded (2026-07-23): over many sources the model emitted a long options list and
                // ran out of max_tokens mid-generation, truncating the emit_synthesis tool-call JSON
                // (Groq 400 tool_use_failed -> the session's synthesize step failed -> no verdict
                // rendered despite dozens of gathered sources). A focused ranked shortlist is also
                // better UX for a purchase decision than an exhaustive dump.
                maxItems: 5,
                description:
                  "At most the 5 strongest canonical product options, deduplicated from the free-text option mentions in the findings, ranked best to worst based on organic findings only. Emit a tight shortlist of the best answers, NOT every product mentioned across the findings.",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string", description: "Canonical product/model name." },
                    score: { type: "number", description: "Relative score, higher is better." },
                    pros: { type: "array", maxItems: 3, description: "Up to 3 concise pros, roughly 55 characters each.", items: { type: "string" } },
                    cons: { type: "array", maxItems: 3, description: "Up to 3 concise cons, roughly 55 characters each.", items: { type: "string" } },
                    rank: { type: "integer", description: "1-indexed rank, 1 is best." },
                    overBudget: {
                      type: "boolean",
                      description:
                        "Strictly whether this option's typical price, as evidenced in the findings, exceeds the shopper's stated budget from the parsed query. False when no budget was stated.",
                    },
                    priceNote: {
                      type: "string",
                      description:
                        "The option's approximate price as stated in the findings, plus its relation to the budget, e.g. \"$549, over your $500 budget\" or \"$89, within budget\". Empty string if no price evidence exists in the findings for this option.",
                    },
                    sourceUrls: {
                      type: "array",
                      maxItems: 4,
                      description:
                        "At most 4 url values of the findings that support THIS specific option — copy them exactly from the findings provided below, do not invent or alter URLs. Deduplicated.",
                      items: { type: "string" },
                    },
                  },
                  required: ["name", "score", "pros", "cons", "rank", "overBudget", "priceNote", "sourceUrls"],
                },
              },
              verdict: {
                type: "string",
                description:
                  "A plain-language final verdict summarizing the ranked options and their tradeoffs against the shopper's stated use case and budget, including a distinct closing note on what sponsored/affiliate sources claimed and how it differed (if at all) from the organic consensus. If there were no sponsored/affiliate findings, omit that note.",
              },
            },
            required: ["options", "verdict"],
          },
        },
      },
    ],
    tool_choice: { type: "function", function: { name: toolName } },
    messages: [
      {
        role: "user",
        content: [
          `Shopper query: "${input.sessionQuery}"`,
          `Parsed: product="${input.parsed.product}", useCase="${input.parsed.useCase}", budget="${input.parsed.budget}"`,
          "",
          input.parsed.budget
            ? `Budget check REQUIRED: the shopper stated a budget of "${input.parsed.budget}". For every option, set overBudget=true and write a priceNote (e.g. "$549, over your ${input.parsed.budget} budget") whenever the findings' price evidence puts it above that budget. An over-budget option may still be ranked and included if it's genuinely the best answer — but it must never be presented unmarked. Options within budget get overBudget=false and a priceNote like "$89, within budget" when price evidence exists.`
            : `No budget was stated — set overBudget=false for every option. Still fill priceNote with price evidence from the findings when present, else "".`,
          "Emit AT MOST 5 ranked options — the strongest shortlist for the shopper, not every product mentioned in the findings.",
          "For every option, set sourceUrls to the url values (copied exactly, not invented) of the findings below that support that specific option.",
          "",
          `Organic findings (${organicFindings.length}) — use these to rank options, build pros/cons, and populate priceNote/sourceUrls:`,
          JSON.stringify(organicFindings, null, 2),
          "",
          `Sponsored/affiliate findings (${nonOrganicFindings.length}) — do NOT use these to rank options; only reference them in the verdict's separate sponsored-sources note (their urls may still back a sourceUrls entry if they support an option's price):`,
          JSON.stringify(nonOrganicFindings, null, 2),
        ].join("\n"),
      },
    ],
    }),
    // Patient retry (2026-07-23): synthesize runs once, right after the extraction storm has
    // drained the 8000 TPM bucket, so its token-429 must wait out a full ~50s refill (sometimes
    // twice as stragglers contend). 4 retries at up to 45s each stays well under the route's 300s
    // budget, versus the extraction default (2 retries / 40s) that is tuned for dozens of
    // concurrent calls where long waits would clog the pipeline.
    { maxRetries: 4, maxDelayMs: 45_000 }
  );

  const parsed = parseForcedToolCall<{
    options: SynthesizedOption[];
    verdict: string;
  }>(response.choices[0].message, toolName, "synthesize");

  // Guard against invention: a forced tool call is reliable about *shape*, not about whether the
  // model copied a real url or fabricated one. Only URLs that actually appear among the findings
  // it was shown are allowed through — everything else (typos, hallucinated domains) is dropped
  // rather than silently trusted, since these render as real outbound links in the product card.
  const knownUrls = new Set(
    [...organicFindings, ...nonOrganicFindings].map((f) => f.url).filter(Boolean)
  );
  const options = parsed.options.map((o) => ({
    ...o,
    sourceUrls: Array.from(new Set((o.sourceUrls ?? []).filter((u) => knownUrls.has(u)))).slice(
      0,
      MAX_SOURCE_URLS_PER_OPTION
    ),
  }));

  return { options, verdict: parsed.verdict };
}
