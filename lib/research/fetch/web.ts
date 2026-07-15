// The Verdict Room — generic web content fetch via Jina Reader (PLAN.md §2).
// Works unauthenticated (IP-rate-limited), but sends JINA_API_KEY when set — that's the same key
// lib/research/search.ts uses for s.jina.ai, since Reader and Search draw from one shared Jina
// token pool. Authenticating raises Reader's own rate ceiling too, not just Search's.

// Bounds the network call so a hung Jina Reader request fails fast instead of riding out the
// serverless function's own execution-time limit — see fetch/youtube.ts for the same reasoning.
const FETCH_TIMEOUT_MS = 15_000;

export async function fetchWebContent(url: string): Promise<{ content: string } | null> {
  let readerUrl: string;
  try {
    readerUrl = `https://r.jina.ai/${new URL(url).toString()}`;
  } catch {
    return null;
  }

  const apiKey = process.env.JINA_API_KEY;

  try {
    const response = await fetch(readerUrl, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      return null;
    }

    const content = await response.text();
    if (!content.trim()) {
      return null;
    }

    return { content };
  } catch {
    // Network error, timeout, or abort — treat the same as "no content available".
    return null;
  }
}
