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
