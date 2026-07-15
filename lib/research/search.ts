// The Verdict Room — Jina Search dispatch (PLAN.md §2, §3 step 1).
// Pure fetch wrapper: no Prisma/DB calls here.
//
// Replaced Google Custom Search 2026-07-15: Google's 100 queries/day free tier is shared across
// the whole app (not per user), and required a manual "enable the Custom Search JSON API" step on
// the Google Cloud project that got missed at launch, silently failing every research session
// until diagnosed. Jina was already an existing vendor relationship (lib/research/fetch/web.ts
// uses Jina Reader for content fetching) — this reuses the same JINA_API_KEY rather than adding a
// new one, per PLAN.md §2's own note that s.jina.ai was the intended fallback.

export type SearchResult = {
  url: string;
  title: string;
  snippet: string;
};

/**
 * Thrown when the Jina Search API itself signals an error (missing/invalid key, rate limit,
 * malformed response). Callers can catch this to distinguish "the API failed" from "the API
 * succeeded with zero results."
 */
export class SearchProviderError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "SearchProviderError";
  }
}

const ENDPOINT = "https://s.jina.ai/";
const FETCH_TIMEOUT_MS = 15_000;

// Jina's response wraps results in a top-level "data" array of
// { title, description, url, ... } objects — see docs.jina.ai. X-Respond-With: no-content skips
// full page content per result (we only need candidate URLs here; lib/research/extract.ts does
// its own separate fetch+extract pass on each chosen URL), which also keeps the token cost down
// on Jina's shared token-based billing.
type JinaSearchResponse = {
  code?: number;
  data?: Array<{ url?: string; title?: string; description?: string }>;
};

export async function webSearch(query: string): Promise<SearchResult[]> {
  const apiKey = process.env.JINA_API_KEY;

  if (!apiKey) {
    throw new SearchProviderError("JINA_API_KEY is not set", 0);
  }

  const url = new URL(ENDPOINT);
  url.searchParams.set("q", query);

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
        "X-Respond-With": "no-content",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    throw new SearchProviderError(
      `Jina Search request failed: ${err instanceof Error ? err.message : String(err)}`,
      0
    );
  }

  const body = (await response.json().catch(() => null)) as JinaSearchResponse | null;

  if (!response.ok) {
    throw new SearchProviderError(
      `Jina Search API error (${response.status})`,
      response.status
    );
  }

  const items = body?.data;
  if (!items) {
    return [];
  }

  return items
    .filter((item): item is { url: string; title?: string; description?: string } =>
      Boolean(item.url)
    )
    .map((item) => ({
      url: item.url,
      title: item.title ?? "",
      snippet: item.description ?? "",
    }));
}

// Second, independent discovery route (added 2026-07-15 — "don't rely on a single source
// finder"): direct YouTube search-results scrape, same unauthenticated-fetch + embedded-JSON-
// parse technique lib/research/fetch/youtube.ts already uses for transcripts (parses
// ytInitialPlayerResponse there, ytInitialData here). No API key, no new vendor — YouTube results
// are frequently under-represented in general web search rankings compared to text content, so
// this also improves coverage, not just redundancy.
//
// A real Reddit search route was evaluated and dropped: both reddit.com/search.json and the
// permalink .json pattern lib/research/fetch/reddit.ts already uses returned live 403s in
// testing (confirmed against a real, current permalink, not a guessed one) — Reddit's
// unauthenticated JSON access appears to be broadly blocked now, not just rate-limited. Revisit
// if that changes; a v2 option is Reddit's real OAuth API (PLAN.md §2 originally specified this,
// dropped for signup friction).
const YOUTUBE_FETCH_TIMEOUT_MS = 15_000;

type YoutubeVideoRenderer = {
  videoId?: string;
  title?: { runs?: Array<{ text?: string }> };
  descriptionSnippet?: { runs?: Array<{ text?: string }> };
};

function extractYoutubeVideos(html: string): SearchResult[] {
  const match = html.match(/ytInitialData\s*=\s*(\{[\s\S]*?\});/);
  if (!match) {
    // Diagnostic, not silent: this worked in local testing against the real endpoint, but
    // Vercel's outbound IPs may get served a different response (consent/localization redirect,
    // bot-detection page) than a dev shell does — this log is how to tell those apart from a
    // genuine YouTube markup change without guessing.
    console.error(
      `youtubeSearch: no ytInitialData found in response (${html.length} chars, starts with: ${html.slice(0, 200).replace(/\s+/g, " ")})`
    );
    return [];
  }

  let data: unknown;
  try {
    data = JSON.parse(match[1]);
  } catch (err) {
    console.error(`youtubeSearch: ytInitialData matched but failed to parse as JSON`, err);
    return [];
  }

  // Undocumented, scraped structure — walk it defensively since YouTube can change this without
  // notice; any shape mismatch degrades to "zero results from this route" rather than a throw.
  const sections =
    (
      data as {
        contents?: {
          twoColumnSearchResultsRenderer?: {
            primaryContents?: {
              sectionListRenderer?: { contents?: Array<{ itemSectionRenderer?: { contents?: unknown[] } }> };
            };
          };
        };
      }
    )?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents ?? [];

  const results: SearchResult[] = [];
  for (const section of sections) {
    const items = section?.itemSectionRenderer?.contents ?? [];
    for (const item of items as Array<{ videoRenderer?: YoutubeVideoRenderer }>) {
      const vr = item?.videoRenderer;
      if (!vr?.videoId) continue;
      const title = vr.title?.runs?.map((r) => r.text ?? "").join("") ?? "";
      const snippet = vr.descriptionSnippet?.runs?.map((r) => r.text ?? "").join("") ?? "";
      results.push({
        url: `https://www.youtube.com/watch?v=${vr.videoId}`,
        title,
        snippet,
      });
    }
  }
  return results;
}

// Never throws — this is a supplementary discovery route, not the primary one. A failure here
// (network error, YouTube layout change) should degrade to zero results, not fail the whole
// search step the way a SearchProviderError from webSearch does. Failures are still logged
// (never a silent catch) so a systemic problem — e.g. Vercel's outbound IPs getting a different
// response than a dev shell does — shows up in get_runtime_errors instead of just looking like
// "this route never contributes anything."
export async function youtubeSearch(query: string): Promise<SearchResult[]> {
  try {
    const url = new URL("https://www.youtube.com/results");
    url.searchParams.set("search_query", query);

    const response = await fetch(url.toString(), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(YOUTUBE_FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.error(`youtubeSearch: request for "${query}" returned ${response.status}`);
      return [];
    }

    const html = await response.text();
    const results = extractYoutubeVideos(html);
    if (results.length === 0) {
      console.error(`youtubeSearch: 0 results for "${query}" (${response.status}, ${html.length} chars)`);
    }
    return results;
  } catch (err) {
    console.error(`youtubeSearch: request for "${query}" threw`, err);
    return [];
  }
}
