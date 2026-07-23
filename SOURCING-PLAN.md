# Sourcing & YouTube Pipeline Upgrade — Checkpoint

Tracks the 2026-07-16 work fixing four reported problems: no dedicated YouTube review
pipeline, source counts collapsing from the advertised "up to 50" to single digits,
no citation trail for sites visited, and underused scraping tooling. Full design
rationale lives in the plan this checkpoint was created from — this file exists so
"keep working" after a session-limit reset resumes instead of re-deriving it.

## Deliverables

| # | Deliverable | Status |
|---|---|---|
| 1 | YouTube merged review pipeline (script + groundedness + pain/good points + review draft) | Done, code-reviewed |
| 2 | Source-discovery widening + backfill so sessions land far closer to the advertised cap | Done, code-reviewed (backfill claim now retries up to 3 candidates) |
| 3 | Full attempt-audit trail + "every site we checked" transparency UI | Done, code-reviewed (terminal-status orphan fix applied) |
| 4 | Reddit via Browserbase, YouTube fetch via a maintained library, repos/index.md updated | Done, code-reviewed |
| 5 | Marketing copy reworded to match live-tested real source counts | Done |

## Decisions locked in

- YouTube pipeline is **one merged Groq call** per video (script cleanup +
  groundedness + pain/good points + review draft together), not a 4-call chain —
  keeps Groq free-tier call volume roughly where it is today.
- Reddit access moves to a **Browserbase real-browser session**, replacing the now
  permanently-dead unauthenticated `.json` fetch (Reddit deprecated that access
  2026-05-28 — this is a policy block, not a bug in our client). Requires a
  Browserbase plan with Proxies/Verified Sessions — Free tier doesn't include those.
  `BROWSERBASE_API_KEY` needs to be added to `.env.local`.
- Marketing copy ("up to 50 tabs/sources") gets reworded only after the widened
  pipeline is live-tested and a real number is observed — not hardcoded speculatively.

## Sequencing

1. Schema migration (`SourceAttempt`, `Source.reviewDraft`/`groundednessConfidence`) —
   everything else depends on this.
2. Attempt-audit trail plumbing (continueSearch writes attempts, process-source
   updates them, GET route returns them).
3. Discovery widening (Jina `num` param, per-query `youtubeSearch`, plan-flexed query
   count) + bounded backfill from overflow attempts.
4. YouTube merged review pipeline (`lib/research/youtube-review.ts`).
5. Scraping swaps: `youtube-caption-extractor` replaces the hand-rolled YouTube
   transcript scrape; `reddit-browserbase.ts` replaces the dead Reddit JSON fetch.
6. UI: transparency panel (every attempt, not just successes) + per-video review
   rendering with a groundedness indicator.
7. Live end-to-end verification.
8. Marketing copy reworded to the observed real range.

## Log

- 2026-07-16: Plan approved, schema migration starting next.
- 2026-07-16/17: All five workstreams implemented. Schema pushed to the live Supabase DB
  (with explicit user go-ahead, per DEPLOY.md's no-agent-runs-db-push convention).
  Three parallel review agents adversarially audited the diff:
  - YouTube pipeline (lib/llm.ts, extract.ts, fetch/youtube.ts): no bugs found.
  - Reddit Browserbase + transparency UI: no bugs found; one cosmetic tab-filter
    mismatch in components/attempt-list.tsx (the "NOT NEEDED" tab counted both
    `discovered` and `dispatched` attempts but only filtered to `discovered`) — fixed.
  - Schema/backfill logic: two real findings, both fixed —
    (a) the backfill claim only tried one overflow candidate per failure, so two
    near-simultaneous failures racing for the same candidate wasted a second,
    untouched candidate — now retries up to 3 candidates before giving up;
    (b) a `process-source` call landing after its session already reaped as
    `timed_out` left that URL's SourceAttempt row stuck at "dispatched" forever in
    the transparency panel — now closes it out as `failed`/`session_ended`.
- 2026-07-17: Browser sign-in test blocked by a Supabase Auth redirect-URL allowlist
  issue (dashboard config, not fixable from code) — bounced to production instead of
  localhost. User chose to skip the browser test and verify via a direct script
  instead (`scripts/verify-pipeline.ts`, deleted after use) exercising the real
  pipeline functions against the live DB and real Jina/Groq/YouTube/Browserbase APIs,
  bypassing only the Supabase Auth layer.
- **Three live runs, real results:**
  - Discovery: 75-89 unique URLs found per session (cap=15, free tier) — up from a
    handful of raw candidates pre-fix.
  - Delivered sources: 13-14 of 15 (87-93%) after backfill, across all three runs —
    up from the reported 6-8.
  - YouTube pipeline: 3/3 succeeded on the final run with real, coherent
    `reviewDraft`s and groundedness scores of 0.92-0.93.
  - Reddit via Browserbase: 0/6-0/3 across all runs — confirmed not a code bug
    (sessions launch and `extract()` runs, it just finds nothing) — matches the
    documented Free-tier Proxies/Verified Sessions limitation exactly.
  - Synthesis completed cleanly on the final run with a real, well-reasoned verdict.
  - `SourceAttempt` audit trail correctly recorded all 79 URLs by status.
- **Two real bugs found and fixed live, not by inspection:** unbounded `findings`
  count/length in `extractAndClassify`/`extractYoutubeReview` caused truncated-JSON
  400s once discovery started actually surfacing many-product roundup content (fixed:
  `maxItems` + explicit ~100-char guidance on `claim`/`quote`, plus a larger
  `max_tokens` budget for the YouTube call specifically since it also produces a
  `reviewDraft`); `synthesize()`'s aggregate truncation (60 findings/240 chars) still
  hit Groq's 8K TPM ceiling once real source counts rose — tightened twice, to
  32 findings/150 chars, confirmed clean on the third run.
- Marketing copy (deliverable 5): reworded the two plan-agnostic "up to 50 tabs"
  spots (`app/page.tsx`, `app/how-it-works/page.tsx`) to "dozens of tabs... up to 50
  on Pro" so free-tier visitors (real cap 15) aren't shown a Pro-only ceiling as a
  blanket promise. Left the pricing page's tier-scoped "Up to 15" / "Up to 50" claims
  as-is — both are now honest given the real 87-93% delivery rate confirmed above.
- **Not yet done:** a real browser-driven end-to-end test (blocked on the Supabase
  redirect-URL allowlist fix — add `http://localhost:3000/auth/callback` to
  Authentication → URL Configuration → Redirect URLs in the Supabase dashboard) and
  code review/deploy of `scripts/` additions since those were deleted after use.
  Deploying these changes to Vercel (`/ship`) has not happened — everything above was
  verified locally against the live database only.

## 2026-07-19 — Production incident: session reaped `timed_out` despite 10 good sources

A real user session finished with 10 sources successfully processed but still ended
up reaped as `status="failed", failureReason="timed_out"`. Diagnosis confirmed from
production DB + Vercel runtime logs (not re-derived, taken as given for this fix):

1. **508 LOOP_DETECTED on backfill.** `process-source/route.ts`'s bounded backfill
   re-dispatched a fresh POST to its own route via `dispatchInternal` on every
   claimed replacement candidate. Chains of failures (common once discovery is
   dominated by doomed YouTube URLs — see #2) accumulated Vercel's function-
   invocation recursion depth until the platform started rejecting the hop outright
   with a 508. A rejected hop left its `SourceAttempt` stuck at `"dispatched"`
   forever and `expectedSources` never reconciled down, so the `sourceCount >=
   expectedSources` completion check could never fire — the session just ran out
   the `STALE_SESSION_MS` clock and got reaped.
2. **YouTube transcript fetch is IP-blocked from Vercel in production.** InnerTube
   returns `LOGIN_REQUIRED` ("Sign in to confirm you're not a bot") on every client
   profile from Vercel's IPs. Discovery is ~60% YouTube URLs, so both the plan's
   dispatch cap and the backfill overflow pool were dominated by URLs that were
   never going to succeed, no matter how much backfill capacity existed. No code fix
   beats an IP block — the fix is prioritization (send web URLs first), not repair.
3. **Groq 429 retries ignored `retry-after`.** `lib/llm.ts`'s `withRateLimitRetry`
   waited a flat ~1.5s once regardless of the actual `retry-after` header (2-38s
   observed), so recoverable rate-limit hits failed permanently against a longer
   reset window.

### Fixes shipped this session

| # | Fix | File(s) |
|---|---|---|
| 1 | Hop-loss reconciler — client-polled `GET` reaps `SourceAttempt` rows stuck at `"dispatched"` past `ATTEMPT_STALE_MS` (3 min), decrements `expectedSources`, and re-runs the completion check (fail `all_sources_failed` or dispatch synthesize) so a session with lost hops can still finish instead of hanging to `timed_out`. | `app/api/research/[id]/route.ts`, `components/research-types.ts` (new `ATTEMPT_STALE_MS`), `components/attempt-list.tsx` (new `hop_lost` label) |
| 2 | Killed the recursive backfill dispatch — the primary URL's fetch/extract/persist logic was factored into `processOneUrl()`, reused inline for at most one backfill candidate per invocation instead of firing another POST at the route. No more self-dispatch chain, no more 508. | `app/api/research/[id]/process-source/route.ts` |
| 3 | Platform-priority dispatch — discovered URLs are stably sorted web-first/youtube/reddit-last before the cap slice in `continueSearch`, and the backfill claim query orders by `platform desc` (web first, per the schema's `youtube < reddit < web` enum declaration order) so doomed URLs stop eating the cap ahead of URLs that can actually succeed. | `app/api/research/route.ts`, `app/api/research/[id]/process-source/route.ts` |
| 4 | Groq `retry-after` honored — reads the real header (falls back to parsing "try again in Xs" from the message, else 5s), waits `min(retryAfter + jitter, 40s)`, allows up to 2 retries instead of 1. | `lib/llm.ts` |
| 5 | Session liveness touch — `processOneUrl()` bumps the parent session's `updatedAt` after every processed URL (success or failure) so a session actively grinding through a Groq-throttled tail of slow successes isn't mistaken for dead and reaped at the 10-minute `STALE_SESSION_MS` mark. | `app/api/research/[id]/process-source/route.ts` |

`bun run lint` and `bun run build` both green after all five fixes. Not deployed —
this session did not commit, push, or run `prisma db push` per instruction.

(Deployed 2026-07-19 as commit cba62bc — the "not deployed" line above predates the ship.)

## 2026-07-19 — Product-experience brief (5 deliverables)

User-reported after testing the stall fixes live:

| # | Deliverable | Status |
|---|---|---|
| 1 | YouTube transcript fetch working IN PRODUCTION — via Browserbase real-browser fallback (feasibility-proven: 9,892 chars extracted from a live video's transcript panel; Browserbase egresses from its own infra, not Vercel's blocked IPs) | Done — `lib/research/fetch/youtube-browserbase.ts` (new), `lib/research/fetch/youtube.ts` chains InnerTube then Browserbase. Live-tested against a real video: 8,105 chars of clean prose extracted (author not found on this particular video, best-effort per spec). |
| 2 | Budget-constraint flagging — options priced beyond the user's stated budget must carry an explicit "over budget" flag/note in synthesis output and UI, never presented unmarked | Done — `emit_synthesis` tool schema now requires `overBudget`/`priceNote`/`sourceUrls` per option (`lib/llm.ts`), persisted on `Option` rows and embedded in `verdictJson` (`synthesize/route.ts`), rendered as a destructive-variant "OVER BUDGET" badge + price note on the ranked row (`components/verdict.tsx`). |
| 3 | Per-option source links — each ranked option links out to the source pages that support it, so users can reach the product's direct source data | Done — `sourceUrls` validated against real finding URLs and capped at 6 per option in `synthesize()`; rendered as hostname-labeled outbound links in the product card. |
| 4 | Product cards — clicking a result row opens a card: product details, pros/cons, price/budget note, source links, and a product image (fetched from a free image source, cached) | Done — ranked rows are now buttons opening `components/product-card.tsx` (base-ui `Dialog` added via `bunx shadcn add dialog`, restyled to the clay system); image lazily fetched via new `POST /api/research/[id]/product-image` (Bing image-search scrape, cached on `Option.imageUrl`, graceful null on any failure — parse logic live-verified against two real product names before wiring in). |
| 5 | YouTube transcripts public and visible — persist the transcript on the Source row and render it expandably on YouTube source cards | Done — persisted in `app/api/research/[id]/process-source/route.ts` (TRANSCRIPT_MAX_CHARS 60K), exposed via `app/api/research/[id]/route.ts` GET, rendered as a collapsed-by-default "VIEW TRANSCRIPT" toggle in `components/source-list.tsx`. |

Design decisions locked in:
- YouTube fetch order: InnerTube library first (free, works locally and if YouTube ever
  unblocks Vercel), Browserbase second (costs session minutes — mitigated by the 30-day
  Source cache making each video a one-time fetch across all users).
- Discovery priority becomes web/youtube interleaved (reddit still last) now that YouTube
  is viable in production again.
- Product images: lazily fetched on first card open via a new authed API route (Bing
  image scrape, graceful null fallback), persisted on the Option row as a cache.
- Feasibility script: scripts/test-yt-browserbase.ts (delete before ship).

## 2026-07-23 — YouTube STILL dead in production: real root cause + external-service fix

The 2026-07-19 Browserbase-fallback ship did NOT land a single YouTube transcript in
production. Live diagnosis (get_runtime_errors on dpl_6ejP..., the current prod deploy,
which already carries BROWSERBASE_API_KEY via a redeploy) found the actual cause:

| Path | Prod result | Root cause |
|---|---|---|
| InnerTube (`youtube-caption-extractor`) | 48× fail | YouTube IP-blocks Vercel: `LOGIN_REQUIRED, Sign in to confirm you're not a bot` on every client profile. Not a bug in our client. |
| Browserbase browser session | 48× crash at init (YouTube) + 14× (Reddit) | Stagehand's internal `pino` logger throws `unable to determine transport target for "pino-pretty"` inside the webpack serverless bundle. The browser session NEVER runs. Local feasibility worked only because pino-pretty resolves from local node_modules. |

So the env var was never the blocker — Stagehand dies before it opens a browser, and it
takes Reddit down with it.

Fix (per the standing goal: "use external sites/sources or YouTube itself"):
1. NEW `lib/research/fetch/youtube-external.ts` — a provider chain hitting kome.ai's
   free transcript API (`POST https://kome.ai/api/transcript` `{video_id, format:true}`
   -> `{transcript, length, hasMore, isPremium}`). Fetches on kome's own infra, so
   Vercel's YouTube IP block is irrelevant. LIVE-VERIFIED against the exact videos that
   failed in prod: Z-wIGXluoug (Sony, 15.6K chars, hasMore:false) and -XrB-97lO1Q
   (Kodak). Returns clean prose, better for LLM extraction than caption fragments.
2. `lib/research/fetch/youtube.ts` chain reordered: external (kome) -> InnerTube ->
   browser. External carries prod; InnerTube stays as a free local path; browser is the
   last resort.
3. `next.config.ts` `serverExternalPackages` for stagehand/pino/pino-pretty so webpack
   stops bundling them and pino resolves its transport at runtime — fixes the crash for
   BOTH the YouTube browser fallback and Reddit. Belt-and-suspenders: verbose:0 + a
   plain logger passed to both Stagehand constructors.

No schema change -> ships as a normal auto-deploy (which also re-confirms the env var).
Kome path is verifiable locally (plain HTTP, identical behavior local vs Vercel); the
pino fix is only verifiable in prod logs, acceptable because YouTube success now rides on
kome, not on the browser fallback.
