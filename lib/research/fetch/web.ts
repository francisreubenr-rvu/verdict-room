// The Verdict Room — generic web content fetch via Jina Reader (PLAN.md §2).
// Free, zero-config baseline usage: no API key required.

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

  try {
    const response = await fetch(readerUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
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
