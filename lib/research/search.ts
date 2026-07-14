// The Verdict Room — Google Custom Search dispatch (PLAN.md §2, §3 step 1).
// Pure fetch wrapper: no Prisma/DB calls here.

export type SearchResult = {
  url: string;
  title: string;
  snippet: string;
};

/**
 * Thrown when the Google Custom Search API itself signals an error (e.g. the 100/day free-tier
 * quota from PLAN.md §2 is exhausted, or the request was otherwise rejected). Callers can catch
 * this to distinguish "the API failed" from "the API succeeded with zero results."
 */
export class GoogleSearchError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "GoogleSearchError";
  }
}

const ENDPOINT = "https://www.googleapis.com/customsearch/v1";

export async function googleCustomSearch(query: string): Promise<SearchResult[]> {
  const apiKey = process.env.GOOGLE_CUSTOM_SEARCH_API_KEY;
  const cx = process.env.GOOGLE_CUSTOM_SEARCH_CX;

  if (!apiKey || !cx) {
    throw new GoogleSearchError(
      "GOOGLE_CUSTOM_SEARCH_API_KEY or GOOGLE_CUSTOM_SEARCH_CX is not set",
      0
    );
  }

  const url = new URL(ENDPOINT);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("cx", cx);
  url.searchParams.set("q", query);

  const response = await fetch(url.toString());
  const body = await response.json();

  if (!response.ok) {
    const message =
      typeof body === "object" && body !== null && "error" in body
        ? // Google's error shape: { error: { code, message, ... } }
          ((body as { error?: { message?: string } }).error?.message ?? response.statusText)
        : response.statusText;
    throw new GoogleSearchError(
      `Google Custom Search API error (${response.status}): ${message}`,
      response.status
    );
  }

  const items = (body as { items?: Array<{ link?: string; title?: string; snippet?: string }> })
    .items;

  if (!items) {
    return [];
  }

  return items
    .filter((item): item is { link: string; title?: string; snippet?: string } =>
      Boolean(item.link)
    )
    .map((item) => ({
      url: item.link,
      title: item.title ?? "",
      snippet: item.snippet ?? "",
    }));
}
