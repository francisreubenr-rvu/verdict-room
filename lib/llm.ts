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
// collection (which imports every route module) when GROQ_API_KEY isn't set yet, e.g. no
// .env.local. Matches lib/stripe.ts's getStripe() pattern.
let client: OpenAI | undefined;

function getGroq(): OpenAI {
  if (!client) {
    client = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: "https://api.groq.com/openai/v1",
    });
  }
  return client;
}

// openai/gpt-oss-120b — Groq's own recommended replacement for the now-deprecated
// llama-3.3-70b-versatile, with native tool-use/function-calling support. Free tier is rate-limited
// (30 req/min, 1K req/day, 8K tokens/min, 200K tokens/day as of this writing) — worth knowing if
// extract+classify calls (one per source, up to 12/session) start getting throttled.
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
 * {product, useCase, budget} and generates 3-5 targeted search query strings covering the
 * product name, "best X review", "X reddit", "X problems/complaints", and "X sponsored review"
 * patterns.
 */
export async function generateSearchQueries(
  query: string
): Promise<{ queries: string[]; parsed: ParsedQuery }> {
  const toolName = "emit_search_plan";

  const response = await getGroq().chat.completions.create({
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
                description:
                  "3 to 5 targeted search engine query strings: the bare product name, a 'best X review' style query, an 'X reddit' query, an 'X problems' or 'X complaints' query, and an 'X sponsored review' style query. Tailor wording to the parsed product/useCase/budget.",
                items: { type: "string" },
                minItems: 3,
                maxItems: 5,
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
  // The 3-5 item bound is a schema *hint*, not an enforced constraint — a model that ignores it
  // fires one Google Custom Search call per extra query, eating into the shared 100/day quota.
  return { queries: input.queries.slice(0, 5), parsed: input.parsed };
}

// All 12 process-source calls for a session fire concurrently, well within reach of Groq's free
// tier's 30 req/min or 8K tokens/min ceiling — a single bounded retry after a short backoff lets
// a 429 clear instead of permanently failing that source (there is no retry anywhere else in the
// pipeline, so today one rate-limited call = one lost source, silently).
async function withRateLimitRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const status = (err as { status?: number } | null)?.status;
    if (status !== 429) throw err;
    await new Promise((resolve) => setTimeout(resolve, 1500 + Math.random() * 1000));
    return fn();
  }
}

/**
 * Step 2 of PLAN.md §3: the merged extract+classify LLM call, run once per fetched source.
 * Extracts option-level findings (claim/sentiment/quote) and classifies the source's
 * sponsorship posture (organic/sponsored/affiliate) with a confidence score.
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

  const requestOptions: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
    model: MODEL,
    max_tokens: 4096,
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
                  "Discrete claims made about specific product options in this source. One entry per distinct claim.",
                items: {
                  type: "object",
                  properties: {
                    option: {
                      type: "string",
                      description: "The specific product/model name this claim is about, free text.",
                    },
                    claim: {
                      type: "string",
                      description: "A concise statement of the claim being made.",
                    },
                    sentiment: {
                      type: "string",
                      enum: ["pro", "con", "neutral"],
                    },
                    quote: {
                      type: "string",
                      description: "A short supporting quote or paraphrase pulled from the source content.",
                    },
                  },
                  required: ["option", "claim", "sentiment", "quote"],
                },
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

  const response = await withRateLimitRetry(() => getGroq().chat.completions.create(requestOptions));

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
export async function synthesize(input: {
  sessionQuery: string;
  parsed: ParsedQuery;
  findings: SynthesisFinding[];
}): Promise<{
  options: Array<{ name: string; score: number; pros: string[]; cons: string[]; rank: number }>;
  verdict: string;
}> {
  const toolName = "emit_synthesis";

  const organicFindings = input.findings.filter((f) => f.sponsorship === "organic");
  const nonOrganicFindings = input.findings.filter((f) => f.sponsorship !== "organic");

  const response = await getGroq().chat.completions.create({
    model: MODEL,
    max_tokens: 4096,
    tools: [
      {
        type: "function",
        function: {
          name: toolName,
          description:
            "Emit a canonicalized, ranked list of product options synthesized from organic findings, plus a plain-language verdict that separately notes what sponsored/affiliate sources said.",
          parameters: {
            type: "object",
            properties: {
              options: {
                type: "array",
                description:
                  "Canonical product options, deduplicated from the free-text option mentions in the findings, ranked best to worst based on organic findings only.",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string", description: "Canonical product/model name." },
                    score: { type: "number", description: "Relative score, higher is better." },
                    pros: { type: "array", items: { type: "string" } },
                    cons: { type: "array", items: { type: "string" } },
                    rank: { type: "integer", description: "1-indexed rank, 1 is best." },
                  },
                  required: ["name", "score", "pros", "cons", "rank"],
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
          `Organic findings (${organicFindings.length}) — use these to rank options and build pros/cons:`,
          JSON.stringify(organicFindings, null, 2),
          "",
          `Sponsored/affiliate findings (${nonOrganicFindings.length}) — do NOT use these to rank options; only reference them in the verdict's separate sponsored-sources note:`,
          JSON.stringify(nonOrganicFindings, null, 2),
        ].join("\n"),
      },
    ],
  });

  return parseForcedToolCall<{
    options: Array<{ name: string; score: number; pros: string[]; cons: string[]; rank: number }>;
    verdict: string;
  }>(response.choices[0].message, toolName, "synthesize");
}
