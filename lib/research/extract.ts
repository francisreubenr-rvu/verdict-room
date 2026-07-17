// The Verdict Room — per-source orchestration (PLAN.md §3 step 2).
// Detects platform from URL, fetches content via the matching method, and runs the merged
// extract+classify LLM call. Returns null (never throws for the "no content" case) so the
// caller — an API route outside this module's scope — can skip the source gracefully.

import {
  extractAndClassify,
  extractYoutubeReview,
  type Finding,
  type Platform,
  type Sponsorship,
} from "@/lib/llm";
import { fetchYoutubeTranscript } from "@/lib/research/fetch/youtube";
import { fetchRedditContent } from "@/lib/research/fetch/reddit-browserbase";
import { fetchWebContent } from "@/lib/research/fetch/web";

export function detectPlatform(url: string): Platform {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return "web";
  }

  // Anchor on a dot boundary so lookalike domains (e.g. "notyoutube.com",
  // "oldreddit.com") don't false-match a bare `endsWith` suffix check.
  if (hostname === "youtube.com" || hostname.endsWith(".youtube.com") || hostname === "youtu.be") {
    return "youtube";
  }
  if (hostname === "reddit.com" || hostname.endsWith(".reddit.com")) {
    return "reddit";
  }
  return "web";
}

// Groq's free tier is a hard 8K tokens/min PER REQUEST (not just aggregate) for
// openai/gpt-oss-120b — confirmed live 2026-07-15: a 24K char cap (assumed ~4 chars/token) still
// produced 413 "Request too large" errors up to 18,066 requested tokens for real fetched pages
// (e-commerce/listing-heavy content tokenizes far worse than 4 chars/token — lots of short
// fragments, prices, punctuation). Cut hard to 8K chars, conservative enough to leave real
// headroom under 8000 even for badly-tokenizing content once the tool-schema prompt overhead and
// reserved max_tokens output budget are added in (Groq's TPM admission check appears to count
// prompt + max_tokens together, not just prompt alone).
const MAX_CONTENT_CHARS = 8_000;

export async function processSource(url: string): Promise<{
  platform: Platform;
  content: string;
  author: string | null;
  findings: Finding[];
  sponsorship: Sponsorship;
  sponsorConfidence: number;
  summary: string;
  reviewDraft: string | null;
  groundednessConfidence: number | null;
} | null> {
  const platform = detectPlatform(url);

  let content: string;
  let fetchedAuthor: string | null;

  if (platform === "youtube") {
    const result = await fetchYoutubeTranscript(url);
    if (!result) {
      return null;
    }
    content = result.content;
    fetchedAuthor = result.author;
  } else if (platform === "reddit") {
    const result = await fetchRedditContent(url);
    if (!result) {
      return null;
    }
    content = result.content;
    fetchedAuthor = result.author;
  } else {
    const result = await fetchWebContent(url);
    if (!result) {
      return null;
    }
    content = result.content;
    fetchedAuthor = null;
  }

  const truncatedContent =
    content.length > MAX_CONTENT_CHARS ? content.slice(0, MAX_CONTENT_CHARS) : content;

  // YouTube gets the merged transcribe/script/verify/pain-good-points/review pipeline
  // (lib/llm.ts's extractYoutubeReview); reddit/web keep the generic extractAndClassify.
  if (platform === "youtube") {
    const review = await extractYoutubeReview({ url, transcript: truncatedContent });
    return {
      platform,
      content,
      author: review.author ?? fetchedAuthor,
      findings: review.findings,
      sponsorship: review.sponsorship,
      sponsorConfidence: review.sponsorConfidence,
      summary: review.summary,
      reviewDraft: review.reviewDraft,
      groundednessConfidence: review.groundednessConfidence,
    };
  }

  const classification = await extractAndClassify({ url, platform, content: truncatedContent });

  return {
    platform,
    content,
    author: classification.author ?? fetchedAuthor,
    findings: classification.findings,
    sponsorship: classification.sponsorship,
    sponsorConfidence: classification.sponsorConfidence,
    summary: classification.summary,
    reviewDraft: null,
    groundednessConfidence: null,
  };
}
