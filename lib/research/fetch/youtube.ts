// The Verdict Room — YouTube transcript fetch via direct `fetch` (PLAN.md §2).
// No subprocess/binary (yt-dlp explicitly ruled out for Vercel compatibility). Missing captions
// is an expected, non-error case — returns null, does not throw.

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

// Decodes the small set of HTML entities YouTube's timedtext XML actually emits, and strips any
// residual tags (e.g. <i>, <b> used for styling within caption cues).
function decodeTranscriptText(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function parseTranscriptXml(xml: string): string | null {
  const matches = [...xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)];
  if (matches.length === 0) {
    return null;
  }
  const lines = matches.map((m) => decodeTranscriptText(m[1])).filter((line) => line.length > 0);
  return lines.length > 0 ? lines.join(" ") : null;
}

type CaptionTrack = {
  baseUrl: string;
  languageCode?: string;
};

// Bounds each network call so a hung request fails fast instead of riding out the serverless
// function's own execution-time limit (which would kill the invocation before it ever gets a
// chance to record completion — see the caller's "last one done" accounting).
const FETCH_TIMEOUT_MS = 15_000;

export async function fetchYoutubeTranscript(
  url: string
): Promise<{ content: string; author: string | null } | null> {
  const videoId = extractVideoId(url);
  if (!videoId) {
    return null;
  }

  // This function documents "returns null, does not throw" — wrap the network calls so that
  // holds for network-level failures (DNS, timeout, abort), not just non-2xx HTTP responses.
  try {
    const pageResponse = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!pageResponse.ok) {
      return null;
    }
    const html = await pageResponse.text();

    const playerResponseMatch = html.match(/ytInitialPlayerResponse\s*=\s*(\{[\s\S]*?\});/);
    if (!playerResponseMatch) {
      return null;
    }

    let playerResponse: {
      videoDetails?: { author?: string };
      captions?: {
        playerCaptionsTracklistRenderer?: { captionTracks?: CaptionTrack[] };
      };
    };
    try {
      playerResponse = JSON.parse(playerResponseMatch[1]);
    } catch {
      return null;
    }

    const author = playerResponse.videoDetails?.author ?? null;
    const captionTracks = playerResponse.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (!captionTracks || captionTracks.length === 0) {
      return null;
    }

    const track =
      captionTracks.find((t) => t.languageCode?.startsWith("en")) ?? captionTracks[0];

    const transcriptResponse = await fetch(track.baseUrl, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!transcriptResponse.ok) {
      return null;
    }
    const xml = await transcriptResponse.text();

    const content = parseTranscriptXml(xml);
    if (!content) {
      return null;
    }

    return { content, author };
  } catch {
    // Network error, timeout, or abort — treat the same as "no transcript available".
    return null;
  }
}
