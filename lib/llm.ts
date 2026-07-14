// The Verdict Room — Claude wrapper (search-query generation, extract+classify, synthesis).
// Pure pipeline logic: no Prisma/DB calls in this file. Per PLAN.md §3, all three calls use
// Claude Sonnet and structured output (forced tool use) so downstream shapes are reliable.

import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Dateless canonical model id for the current Claude Sonnet generation.
const MODEL = "claude-sonnet-5";

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

// `tool_choice`-forced Claude calls are reliable but not guaranteed-valid JSON Schema
// conformance. `sponsorship` and `sentiment` get written straight into Postgres enum columns
// (Prisma throws a validation error on an out-of-range value, but with a message that's opaque
// about *which* LLM call produced it) — a cheap, explicit check here fails with a clearer error
// at the source instead of relying on that downstream throw.
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

  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    tools: [
      {
        name: toolName,
        description:
          "Emit the parsed shopper query and a set of targeted search engine queries to research it.",
        input_schema: {
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
    ],
    tool_choice: { type: "tool", name: toolName },
    messages: [
      {
        role: "user",
        content: `Shopper query: "${query}"\n\nParse this query and generate a search plan per the tool schema.`,
      },
    ],
  });

  const block = message.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === toolName
  );
  if (!block) {
    throw new Error("generateSearchQueries: model did not return a tool_use block");
  }

  const input = block.input as { queries: string[]; parsed: ParsedQuery };
  return { queries: input.queries, parsed: input.parsed };
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

  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    tools: [
      {
        name: toolName,
        description:
          "Emit structured findings extracted from a review source, plus a sponsorship classification for the source as a whole.",
        input_schema: {
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
    ],
    tool_choice: { type: "tool", name: toolName },
    messages: [
      {
        role: "user",
        content: `Source URL: ${input.url}\nPlatform: ${input.platform}\n\nContent:\n${input.content}\n\nExtract findings and classify sponsorship per the tool schema.`,
      },
    ],
  });

  const block = message.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === toolName
  );
  if (!block) {
    throw new Error("extractAndClassify: model did not return a tool_use block");
  }

  const parsed = block.input as {
    findings: Finding[];
    sponsorship: Sponsorship;
    sponsorConfidence: number;
    summary: string;
    author: string | null;
  };

  // Guard the two fields that get written straight into Postgres enum columns downstream.
  assertSponsorship(parsed.sponsorship, "extractAndClassify");
  for (const finding of parsed.findings) {
    assertSentiment(finding.sentiment, "extractAndClassify finding");
  }

  return parsed;
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

  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    tools: [
      {
        name: toolName,
        description:
          "Emit a canonicalized, ranked list of product options synthesized from organic findings, plus a plain-language verdict that separately notes what sponsored/affiliate sources said.",
        input_schema: {
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
    ],
    tool_choice: { type: "tool", name: toolName },
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

  const block = message.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === toolName
  );
  if (!block) {
    throw new Error("synthesize: model did not return a tool_use block");
  }

  return block.input as {
    options: Array<{ name: string; score: number; pros: string[]; cons: string[]; rank: number }>;
    verdict: string;
  };
}
