// The Verdict Room — YouTube transcript fetch (PLAN.md §2).
// Missing captions is an expected, non-error case — returns null, does not throw.
//
// Changed 2026-07-16: replaced the hand-rolled `ytInitialPlayerResponse` regex-scrape (which hit
// a consent-redirect-loop bug in production, see lib/research/search.ts's youtubeSearch for the
// same class of issue) with `youtube-caption-extractor` (repos/youtube-caption-extractor, MIT).
// It posts directly to YouTube's InnerTube API with a multi-client fallback chain (iOS/Android
// VR/mobile web profiles) instead of scraping the watch page's embedded JSON, sidestepping the
// consent-cookie/localization-redirect class of failure entirely. Trade-off: its typed
// `VideoDetails` surface only exposes title/description, not the channel/author name our old
// scrape read from `videoDetails.author` — `fetchYoutubeTranscript` now always returns
// `author: null`, and the merged YouTube review pipeline's own LLM call
// (`extractYoutubeReview` in lib/llm.ts) is the only remaining source for an author guess, on a
// best-effort basis (transcripts rarely state the channel name explicitly).

import { getSubtitles } from "youtube-caption-extractor";

function extractVideoId(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.hostname === "youtu.be") {
    const id = parsed.pathname.slice(1);
    return id || null;
  }

  // Anchor on a dot boundary so lookalike domains (e.g. "notyoutube.com") don't
  // false-match a bare `endsWith` suffix check.
  if (parsed.hostname === "youtube.com" || parsed.hostname.endsWith(".youtube.com")) {
    if (parsed.pathname === "/watch") {
      return parsed.searchParams.get("v");
    }
    const shortsMatch = parsed.pathname.match(/^\/(shorts|embed|live)\/([^/]+)/);
    if (shortsMatch) {
      return shortsMatch[2];
    }
  }

  return null;
}

// Bounds the InnerTube + caption-track network calls so a hung request fails fast instead of
// riding out the serverless function's own execution-time limit (which would kill the invocation
// before it ever gets a chance to record completion — see the caller's "last one done" accounting).
const FETCH_TIMEOUT_MS = 15_000;

export async function fetchYoutubeTranscript(
  url: string
): Promise<{ content: string; author: string | null } | null> {
  const videoId = extractVideoId(url);
  if (!videoId) {
    return null;
  }

  try {
    const subtitles = await getSubtitles({
      videoID: videoId,
      lang: "en",
      fetch: (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }),
    });

    if (subtitles.length === 0) {
      return null;
    }

    const content = subtitles
      .map((s) => s.text.trim())
      .filter((text) => text.length > 0)
      .join(" ");

    if (!content) {
      return null;
    }

    // See file header — the library's typed surface doesn't expose the channel/author name.
    return { content, author: null };
  } catch (err) {
    // Every client in the library's fallback chain failed (private/deleted video, no captions on
    // any profile, or a network-level failure) — still "no transcript available", not fatal to
    // the session, but logged so a systemic issue (e.g. YouTube tightening bot detection further)
    // is diagnosable from get_runtime_errors instead of just looking like "YouTube sources never
    // contribute anything."
    console.error(`fetchYoutubeTranscript: request for ${url} threw`, err);
    return null;
  }
}
