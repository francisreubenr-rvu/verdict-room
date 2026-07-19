// The Verdict Room — YouTube transcript fetch via a real Browserbase browser session.
// Fallback for lib/research/fetch/youtube.ts's InnerTube path, which is IP-blocked from Vercel in
// production (confirmed live 2026-07-19: LOGIN_REQUIRED "Sign in to confirm you're not a bot" on
// every client profile). Browserbase egresses from its own infra, not Vercel's blocked IPs, so a
// real browser session there can still reach the transcript panel. Feasibility proven in
// scripts/test-yt-browserbase.ts (9,892 chars extracted from a live video via the
// engagement-panel innerText fallback) — this ports that recipe into production shape.
//
// Same conventions as lib/research/fetch/reddit-browserbase.ts: env guard on
// BROWSERBASE_API_KEY, try/finally close, returns null rather than throwing for every "no
// transcript available" case so a single bad source degrades gracefully instead of stalling the
// session (see process-source/route.ts's processOneUrl).

import { Stagehand } from "@browserbasehq/stagehand";

// The transcript lives behind: expand description -> "Show transcript" button. Fixed waits (not
// polling) mirror the feasibility script — YouTube's transcript panel render has no reliable
// "settled" DOM event to await, and this is already bounded well under the process-source
// invocation's own budget.
const LOAD_SETTLE_MS = 3_000;
const TRANSCRIPT_RENDER_MS = 6_000;

// The engagement-panel innerText fallback (the one that actually worked in feasibility testing)
// carries a "Transcript / Search transcript" header and one timestamp/duration line per segment
// interleaved with the caption text — strip both so the stored text reads as prose, not a
// timestamped transcript dump.
const HEADER_LINES = new Set(["transcript", "search transcript"]);
const TIMESTAMP_LINE = /^\d{1,2}:\d{2}(:\d{2})?$/;
const DURATION_LINE = /^\d+\s+(second|seconds|minute|minutes|hour|hours)$/i;

function cleanTranscriptText(raw: string): string {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return false;
      if (HEADER_LINES.has(line.toLowerCase())) return false;
      if (TIMESTAMP_LINE.test(line)) return false;
      if (DURATION_LINE.test(line)) return false;
      return true;
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function fetchYoutubeTranscriptViaBrowser(
  url: string
): Promise<{ content: string; author: string | null } | null> {
  if (!process.env.BROWSERBASE_API_KEY) {
    return null;
  }

  let stagehand: Stagehand | null = null;
  try {
    stagehand = new Stagehand({ env: "BROWSERBASE" });
    await stagehand.init();
    const page = await stagehand.context.newPage(url);
    await page.waitForLoadState("load", 20_000).catch(() => {});
    await new Promise((r) => setTimeout(r, LOAD_SETTLE_MS));

    await stagehand.act("If a cookie or consent dialog is visible, dismiss or reject it.");
    await stagehand.act("Expand the video description by clicking '...more' or the description box.");
    await stagehand.act("Click the 'Show transcript' button.");
    await new Promise((r) => setTimeout(r, TRANSCRIPT_RENDER_MS));

    // Try several selectors — YouTube's transcript DOM varies. Fall back to the whole panel's
    // innerText. Author extraction (best effort, same page load) reads the channel name element
    // or, failing that, any link to a channel handle — either can be absent depending on layout.
    const result = await page.evaluate(() => {
      const bySegment = Array.from(
        document.querySelectorAll("ytd-transcript-segment-renderer")
      )
        .map((s) => (s as HTMLElement).innerText?.trim() ?? "")
        .filter(Boolean)
        .join(" ");

      let via = "none";
      let text = "";
      if (bySegment.length > 0) {
        via = "segment-renderer";
        text = bySegment;
      } else {
        const byContainer = (document.querySelector("#segments-container") as HTMLElement | null)
          ?.innerText;
        if (byContainer && byContainer.trim().length > 0) {
          via = "segments-container";
          text = byContainer;
        } else {
          const byPanel = (
            document.querySelector(
              "ytd-engagement-panel-section-list-renderer[target-id*='transcript']"
            ) as HTMLElement | null
          )?.innerText;
          if (byPanel && byPanel.trim().length > 0) {
            via = "engagement-panel";
            text = byPanel;
          }
        }
      }

      const channelNameEl = document.querySelector("ytd-channel-name #text") as HTMLElement | null;
      const handleLinkEl = document.querySelector("a[href^='/@']") as HTMLElement | null;
      const author = channelNameEl?.textContent?.trim() || handleLinkEl?.textContent?.trim() || null;

      return { via, text, author };
    });

    const content = cleanTranscriptText(result.text);
    if (!content) {
      return null;
    }

    return { content, author: result.author };
  } catch (err) {
    // Same "returns null, does not throw" contract as every other fetch module — a failed
    // Browserbase session (missing plan entitlement, quota exhausted, page still blocked) still
    // just excludes this source, but logged so it's diagnosable from get_runtime_errors instead
    // of silently looking like "YouTube sources never contribute anything."
    console.error(`fetchYoutubeTranscriptViaBrowser: request for ${url} threw`, err);
    return null;
  } finally {
    if (stagehand) {
      await stagehand.close().catch(() => {});
    }
  }
}
