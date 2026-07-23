// The Verdict Room — YouTube transcript fetch via external transcript services.
// Added 2026-07-23 as the production-carrying path once both existing options were confirmed
// broken: InnerTube (lib/research/fetch/youtube.ts's fetchViaInnerTube) is IP-blocked from
// Vercel (LOGIN_REQUIRED on every client profile, see that file's header), and the Browserbase
// browser fallback (lib/research/fetch/youtube-browserbase.ts) crashes at Stagehand init on
// Vercel with "unable to determine transport target for 'pino-pretty'" (webpack bundles
// Stagehand's pino logger, which can't load the pino-pretty transport at runtime — see
// next.config.ts's serverExternalPackages for the actual fix to that crash).
//
// External transcript services fetch the video from YouTube on their own infrastructure, not
// ours, so Vercel's IP block is irrelevant to them — same reason Browserbase works, but without
// the cost or fragility of standing up a real browser session. Structured as an ordered provider
// chain (currently one provider, kome.ai) so a second service can be added later without
// reshaping the caller.
//
// kome.ai's contract was live-confirmed 2026-07-23 against real videos: POST
// https://kome.ai/api/transcript with { video_id, format: true } returns
// { transcript, length, hasMore, isPremium } where `transcript` is already clean prose (no
// timestamps). That's actually better input for the downstream LLM review extraction
// (extractYoutubeReview in lib/llm.ts) than InnerTube's raw caption-fragment join — no
// timestamp/segment noise to reason around. kome does not expose the channel/author name, so
// author is always null here, same convention as the InnerTube path.

import { extractVideoId } from "@/lib/research/fetch/youtube";

const KOME_TIMEOUT_MS = 20_000;
const KOME_MIN_TRANSCRIPT_LENGTH = 20;

async function fetchViaKome(
  videoId: string
): Promise<{ content: string; author: string | null } | null> {
  try {
    const response = await fetch("https://kome.ai/api/transcript", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ video_id: videoId, format: true }),
      signal: AbortSignal.timeout(KOME_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.error(`fetchYoutubeTranscriptViaExternal (kome): ${videoId} returned HTTP ${response.status}`);
      return null;
    }

    const data = (await response.json()) as { transcript?: unknown };
    const transcript = typeof data.transcript === "string" ? data.transcript.trim() : "";

    // Guard against kome's own "no transcript" / error-sentinel responses that still come back
    // as a 200 with a short or empty `transcript` field rather than a non-ok status.
    if (transcript.length < KOME_MIN_TRANSCRIPT_LENGTH) {
      return null;
    }

    // kome does not expose the channel/author name — see file header.
    return { content: transcript, author: null };
  } catch (err) {
    console.error(`fetchYoutubeTranscriptViaExternal (kome): request for ${videoId} threw`, err);
    return null;
  }
}

// Ordered provider chain — first success wins. Add more providers here as they're found; each
// takes the extracted video id and returns the same shape as the rest of this pipeline's fetch
// modules (null on any "no content" case, never throws).
const PROVIDERS: Array<
  (videoId: string) => Promise<{ content: string; author: string | null } | null>
> = [fetchViaKome];

export async function fetchYoutubeTranscriptViaExternal(
  url: string
): Promise<{ content: string; author: string | null } | null> {
  const videoId = extractVideoId(url);
  if (!videoId) {
    return null;
  }

  for (const provider of PROVIDERS) {
    const result = await provider(videoId);
    if (result) {
      return result;
    }
  }

  return null;
}
