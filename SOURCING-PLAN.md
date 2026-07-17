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
