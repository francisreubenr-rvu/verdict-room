// PurchasePilot — Reddit content fetch via OAuth2 client-credentials grant (PLAN.md §2, §3a).
// Module-level token cache: the client-credentials token is reusable until it expires, so
// short-lived serverless invocations that land within the token's lifetime skip the token
// fetch entirely. No external cache — a plain variable + expiry timestamp is enough at this scale.

const TOKEN_ENDPOINT = "https://www.reddit.com/api/v1/access_token";
const USER_AGENT = "web:purchasepilot:v1 (by /u/purchasepilot)";
// Bounds each network call so a hung request fails fast instead of riding out the serverless
// function's own execution-time limit — see youtube.ts for the same reasoning.
const FETCH_TIMEOUT_MS = 15_000;

let cachedToken: { accessToken: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.accessToken;
  }

  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("REDDIT_CLIENT_ID or REDDIT_CLIENT_SECRET is not set");
  }

  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
    },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Reddit token request failed (${response.status}): ${response.statusText}`);
  }

  const body = (await response.json()) as { access_token: string; expires_in: number };

  // Subtract a small safety margin so we never use a token that expires mid-flight.
  const expiresAt = Date.now() + (body.expires_in - 60) * 1000;
  cachedToken = { accessToken: body.access_token, expiresAt };
  return body.access_token;
}

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

  let accessToken: string;
  try {
    accessToken = await getAccessToken();
  } catch {
    return null;
  }

  // This function documents "returns null, does not throw" — wrap the network call + JSON
  // parsing so that holds for network-level failures and unexpected response shapes (e.g. a
  // non-`/comments/` path such as a share link, which doesn't return the [post, comments] array
  // shape assumed below), not just non-2xx HTTP responses.
  try {
    const response = await fetch(`https://oauth.reddit.com${pathname}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
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
