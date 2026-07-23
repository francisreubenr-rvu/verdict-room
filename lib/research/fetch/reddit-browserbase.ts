// The Verdict Room — Reddit content fetch via a real Browserbase browser session.
// Replaces lib/research/fetch/reddit.ts (retired 2026-07-16): Reddit deprecated unauthenticated
// `.json` access entirely on 2026-05-28 — every fetch returned a flat 403, confirmed against a
// real, current permalink, not just a guessed one (see PLAN.md §2's log and independent live web
// research). This is Reddit's own IP/TLS-fingerprint-level bot-detection policy, not a bug a
// better fetch client or User-Agent header fixes — a real browser session is the actual
// workaround, per this vault's Browserbase onboarding notes (CLAUDE.md's "Browserbase — Cloud
// Browser Automation" section).
//
// Requires BROWSERBASE_API_KEY in .env.local (not present as of this file's creation — add it).
// Also requires a Browserbase plan with Proxies/Verified Sessions: the Free plan doesn't include
// those, and without them this is likely to hit the same bot-detection wall a plain fetch does,
// just through a real browser instead of a raw HTTP client. That plan upgrade is a cost decision
// for the user to make on Browserbase's dashboard — this file only wires up the integration.
// No BROWSERBASE_PROJECT_ID is needed — the API key alone resolves the project (per this vault's
// Browserbase notes and confirmed in Stagehand's own V3Options: apiKey/projectId are both
// optional and fall back to env vars). Model config is also left unset, so extraction runs on
// Browserbase's built-in Model Gateway (included free up to $5 of tokens) rather than wiring in
// a custom LLM client — the simplest correct default; revisit if that cap becomes a bottleneck.

import { Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod";

const REDDIT_SCHEMA = z.object({
  title: z.string().describe("The post title"),
  author: z
    .string()
    .nullable()
    .describe("The post author's username, or null if deleted/unavailable"),
  selftext: z
    .string()
    .nullable()
    .describe("The post's own text body, or null if it's a link post with no body"),
  topComments: z
    .array(
      z.object({
        author: z.string().nullable(),
        body: z.string(),
      })
    )
    .describe("Up to the top 20 visible comments, in the order they appear on the page"),
});

export async function fetchRedditContent(
  url: string
): Promise<{ content: string; author: string | null } | null> {
  if (!process.env.BROWSERBASE_API_KEY) {
    return null;
  }

  let stagehand: Stagehand | null = null;
  try {
    // Belt-and-suspenders against the pino-pretty crash (see next.config.ts's
    // serverExternalPackages, which is the actual fix): verbose/logger/disablePino are all real
    // options on Stagehand 3.7.0's V3Options (node_modules/@browserbasehq/stagehand/dist/esm/lib/v3/types/public/options.d.ts) —
    // verbose:0 silences internal log emission, logger replaces the default pino-backed sink
    // with a plain function, and disablePino turns off the pino backend outright.
    stagehand = new Stagehand({
      env: "BROWSERBASE",
      verbose: 0,
      logger: () => {},
      disablePino: true,
    });
    await stagehand.init();
    await stagehand.context.newPage(url);

    const post = await stagehand.extract(
      "Extract this Reddit post's title, author, self-text body (if any), and up to the top 20 visible comments with their authors.",
      REDDIT_SCHEMA
    );

    const commentLines = post.topComments
      .slice(0, 20)
      .map((c) => `[${c.author ?? "unknown"}] ${c.body}`);

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
  } catch (err) {
    // Same "returns null, does not throw" contract as every other fetch module — a failed
    // Browserbase session (missing plan entitlement, quota exhausted, page still blocked) still
    // just excludes this source, but logged so it's diagnosable from get_runtime_errors instead
    // of silently looking like "Reddit sources never contribute anything."
    console.error(`fetchRedditContent (Browserbase): request for ${url} threw`, err);
    return null;
  } finally {
    if (stagehand) {
      await stagehand.close().catch(() => {});
    }
  }
}
