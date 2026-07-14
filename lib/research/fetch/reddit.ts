// The Verdict Room — Reddit content fetch via public JSON endpoints (no auth).
// Deviates from PLAN.md §2/§3a's original OAuth2 client-credentials grant — that path requires
// registering a Reddit account + script app, which the user hit signup friction on. This fetches
// the same public post+comments payload Reddit's API would return, just via the unauthenticated
// `<permalink>.json` endpoint instead of oauth.reddit.com. Trade-off: stricter, undocumented
// unauthenticated rate limits (Reddit's OAuth tier is far more generous) — acceptable for this
// project's low request volume (a handful of Reddit URLs per research session), revisit if
// throttling becomes a real problem.

// Reddit rate-limits/blocks requests without a descriptive User-Agent even on the public,
// unauthenticated JSON endpoints — this is not optional even though there's no OAuth token.
const USER_AGENT = "web:theverdictroom:v1 (public JSON, no OAuth)";
// Bounds each network call so a hung request fails fast instead of riding out the serverless
// function's own execution-time limit — see youtube.ts for the same reasoning.
const FETCH_TIMEOUT_MS = 15_000;

type RedditCommentData = {
  body?: string;
  author?: string;
};

type RedditListing<T> = {
  data?: {
    children?: Array<{ kind: string; data: T }>;
  };
};

type RedditPostData = {
  title?: string;
  selftext?: string;
  author?: string;
};

export async function fetchRedditContent(
  url: string
): Promise<{ content: string; author: string | null } | null> {
  let pathname: string;
  try {
    pathname = new URL(url).pathname.replace(/\/+$/, "");
  } catch {
    return null;
  }
  if (!pathname) {
    return null;
  }

  // This function documents "returns null, does not throw" — wrap the network call + JSON
  // parsing so that holds for network-level failures and unexpected response shapes (e.g. a
  // non-`/comments/` path such as a share link, which doesn't return the [post, comments] array
  // shape assumed below), not just non-2xx HTTP responses.
  try {
    const response = await fetch(`https://www.reddit.com${pathname}.json`, {
      headers: {
        "User-Agent": USER_AGENT,
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      return null;
    }

    const body = (await response.json()) as [
      RedditListing<RedditPostData>,
      RedditListing<RedditCommentData>,
    ];

    const post = body[0]?.data?.children?.[0]?.data;
    if (!post) {
      return null;
    }

    const comments = body[1]?.data?.children ?? [];
    const commentLines = comments
      .filter((c) => c.kind === "t1" && c.data.body)
      .slice(0, 20)
      .map((c) => `[${c.data.author ?? "unknown"}] ${c.data.body}`);

    const sections = [
      post.title ? `Title: ${post.title}` : null,
      post.selftext ? post.selftext : null,
      commentLines.length > 0 ? `Comments:\n${commentLines.join("\n")}` : null,
    ].filter((s): s is string => Boolean(s));

    const content = sections.join("\n\n");
    if (!content.trim()) {
      return null;
    }

    return { content, author: post.author ?? null };
  } catch {
    return null;
  }
}
