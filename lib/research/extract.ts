// The Verdict Room — per-source orchestration (PLAN.md §3 step 2).
// Detects platform from URL, fetches content via the matching method, and runs the merged
// extract+classify LLM call. Returns null (never throws for the "no content" case) so the
// caller — an API route outside this module's scope — can skip the source gracefully.

import { extractAndClassify, type Finding, type Platform, type Sponsorship } from "@/lib/llm";
import { fetchYoutubeTranscript } from "@/lib/research/fetch/youtube";
import { fetchRedditContent } from "@/lib/research/fetch/reddit";
import { fetchWebContent } from "@/lib/research/fetch/web";

function detectPlatform(url: string): Platform {
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

// Groq's free tier is 8K tokens/min shared across all 12 concurrent process-source calls a
// session fires — a long review page's full Jina markdown or YouTube transcript can run
// 50-100K characters and single-handedly blow that budget. ~24K chars (~6K tokens) leaves
// headroom for the prompt scaffolding and the model's own output within the per-call budget.
const MAX_CONTENT_CHARS = 24_000;

export async function processSource(url: string): Promise<{
  platform: Platform;
  content: string;
  author: string | null;
  findings: Finding[];
  sponsorship: Sponsorship;
  sponsorConfidence: number;
  summary: string;
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

  const classification = await extractAndClassify({ url, platform, content: truncatedContent });

  return {
    platform,
    content,
    author: classification.author ?? fetchedAuthor,
    findings: classification.findings,
    sponsorship: classification.sponsorship,
    sponsorConfidence: classification.sponsorConfidence,
    summary: classification.summary,
  };
}
