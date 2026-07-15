# The Verdict Room — Implementation Plan

> One input in. Hours of review-watching and review-reading, distilled into a verdict you can trust.

## 1. Problem & Product

A shopper who needs to decide on a purchase spends hours watching YouTube reviews, reading
blog/Reddit/e-commerce reviews, and manually separating **sponsored/affiliate** content from
**organic, uncompensated** opinion — then cross-checking contradictory claims.

**The Verdict Room** takes a single natural-language input and runs the research:

```
"Best noise-cancelling headphones under $300 for travel, I have an iPhone"
```

…and returns a synthesized, sourced report: top picks, evidence with links, a clear
**sponsored vs. organic** split, common complaints / dealbreakers, and a final verdict.

### Personalization in v1 (implicit only)

v1 personalizes from the query itself — no persistent taste-profile engine, even though real
accounts now exist (see §4a):

- The query is parsed for `product`, `useCase`, and `budget` at intake (e.g. "for travel" →
  portability/noise isolation weighted up in ranking; "I have an iPhone" → ecosystem
  compatibility surfaced as a factor). This lives entirely in `ResearchSession.parsed` and biases
  that session's search queries and option ranking — nothing persists beyond the session.
- Explicit taste controls (upvote/downvote, must-have/dealbreaker flags, priority weights that
  persist and bias future sessions) are **still deferred to v2** — see
  [§9](#9-v2-backlog-deferred-not-forgotten). Adding Google Sign-In gives v1 a real `userId` to
  eventually hang a profile off of, but that's a *capability*, not an obligation — nobody has
  reused a profile yet because no one has used the product once. Build the profile system when
  usage data says to, not because the plumbing now makes it easy.

### Non-goals (YAGNI — keep it lean, per `ponytail`)
- No price-comparison / checkout / affiliate monetization.
- No mobile app in v1 (responsive web only).
- No real-time streaming stock ticker of prices.
- No persistent taste profile in v1 (see above) — implicit per-session parsing only.
- (Accounts/auth **are** now in scope — see §4a. This reverses the original v1 non-goal now that
  Supabase is the backend.)

## 2. Stack (Vercel + Supabase)

- **Next.js 16** (App Router) · **TypeScript** · **Bun** (local dev) — deployed on **Vercel**.
- **Tailwind CSS 4** · **shadcn/ui** for components
- **Zustand** (client state) · **TanStack Query** (server state / polling research jobs)
- **Supabase**: Postgres (via Prisma) for all persistence, **Supabase Auth** for Google Sign-In,
  optionally **Supabase Realtime** later for live status instead of polling (v1 uses polling —
  see §3a).
- **LLM**: Groq (`openai/gpt-oss-120b`, via the `openai` SDK pointed at Groq's OpenAI-compatible
  endpoint) for extraction + synthesis, chosen for free-tier API access. **Changed 2026-07-15
  twice** — Claude Sonnet -> DeepSeek -> Groq, same day, see §8 for why.
- **Search discovery**: ~~Google Custom Search API~~ **Changed 2026-07-15**: replaced with Jina
  Search (`s.jina.ai`) — see `lib/research/search.ts`. Google's 100 queries/day free tier
  required enabling the Custom Search JSON API on the exact Google Cloud project the key
  belonged to, a manual step that got missed at first deploy and silently failed every research
  session (no error surfaced anywhere — diagnosed after the fact via Vercel runtime logs). Jina
  was already an existing vendor relationship (content fetching, see the Web/content fetching
  note below), so the swap reuses one key instead of adding a new one — this was already the
  named fallback option in the original note here (kept below for the historical reasoning: "if
  usage grows, options are the paid tier or swapping in a second free search source").
  Originally: Google Custom Search API (`customsearch.googleapis.com`), replacing the earlier
  plan to hand-roll query dispatch against ad hoc scrapers. Known constraint: the free tier was
  100 queries/day, shared across the whole app, not per user — at 3-5 search calls per research
  session, that's roughly 20-30 sessions/day before hitting the quota.
- Secrets: `GROQ_API_KEY`, `JINA_API_KEY` (search discovery + content fetching, shared token pool),
  `GOOGLE_OAUTH_CLIENT_ID`/`SECRET` (configured in Supabase Auth's Google provider, not read
  directly by the app), `DATABASE_URL` (Supabase Postgres connection string),
  `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY`. All in `.env.local`, never committed. (No Reddit secret —
  see the Web/content fetching note below on why that changed from the original OAuth plan.)

### Why Vercel is viable now (it wasn't under the SQLite-only design)

The previous draft ruled out Vercel because a single long-running detached job doesn't survive
serverless function teardown, and there was no database to coordinate progress across separate
invocations. Supabase fixes exactly that: **the pipeline is now a chain of short, independent
function calls that each do one bounded unit of work and write their result to Postgres**, instead
of one big background process. See §3a for the exact chaining mechanism.

### Web/content fetching (unchanged reasoning, one method swapped for Vercel compatibility)

`repos/agent-reach` still doesn't fit (Python CLI for an agent's own shell, not an app backend —
see prior analysis). One change from the earlier draft: **`yt-dlp` as a subprocess is dropped** — Vercel's
Node.js function runtime doesn't reliably support spawning arbitrary Python/ffmpeg-dependent
binaries (bundling, cold starts, and cloud-IP blocking from YouTube's side all stack against it).
Replaced with a **pure-`fetch` YouTube transcript call** (hitting YouTube's `timedtext` endpoint
directly, the same approach the popular zero-dependency transcript libraries use) — no subprocess,
no binary, works in a standard serverless function. Flag: YouTube can still rate-limit or block
requests from cloud-provider IP ranges (including Vercel's) regardless of method — this is a
shared risk with any hosting choice, not something either fetch method eliminates.

- **YouTube** — direct `fetch` against YouTube's transcript endpoint. No auth needed.
- **Web (blogs, e-commerce reviews)** — Jina Reader (`r.jina.ai/<url>`), free, zero-config.
- **Reddit** — public, unauthenticated `<permalink>.json` endpoints, called directly with `fetch`.
  **Changed 2026-07-15** from the original OAuth2 client-credentials grant: that path requires a
  registered Reddit account + script app, which hit real signup friction during deployment. The
  public JSON endpoints return the same post+comments payload, no auth needed — trade-off is
  stricter/undocumented unauthenticated rate limits vs. the OAuth tier, accepted given this
  project's low request volume (a handful of Reddit URLs per session). Revisit if Reddit starts
  throttling/blocking these requests at scale.
- **Search discovery** — Jina Search (`s.jina.ai`), called directly with `fetch`. **Changed
  2026-07-15** from Google Custom Search API — see §2.

## 3. Research Pipeline (the core)

Same 5 logical steps as before (`queued → searching → fetching → extracting → synthesizing →
done | failed`), but the *execution mechanism* changes for Vercel: instead of one function running
the whole thing, each step is its own short-lived API route, chained together, with Postgres
(via Supabase) as the shared state instead of in-memory/process state.

1. **Search** — one LLM call to generate 3-5 targeted queries from the input (product, "best X
   review", "X reddit", "X problems/complaints", "X sponsored review"), then dispatch each to
   Jina Search (§2) in parallel to get candidate URLs. Runs inline in the
   `POST /api/research` handler (fast — one LLM call + a few parallel HTTP calls, well within a
   single function's time budget) and writes the source URL list to `ResearchSession` before
   returning the session id.
2. **Fetch + extract + classify — one function invocation per source, run concurrently.** Each of
   up to 12 candidate URLs is processed by its own call to `POST /api/research/[id]/process-source`
   (fetch content via the appropriate method above, run the merged extract+classify LLM call,
   write the resulting `Source`/`Finding` rows). Because each invocation only does one fetch + one
   LLM call, it comfortably fits inside a single Vercel function's execution window — the earlier
   timeout concern was about running *all 12 sequentially in one function*, not about the work
   itself. The initial `POST /api/research` handler fires all 12 calls via `waitUntil` (from
   `@vercel/functions`) so they run to completion after the initial response is sent, without the
   client waiting on them synchronously. Before fetching a URL, check for an existing `Source` row
   with that URL and `updatedAt` within 30 days — on a hit, skip the fetch and the LLM call
   entirely and just link the cached `Source` into this session (§4). Cross-session, cross-*user*
   caching is now real (Supabase is shared, unlike per-browser SQLite would have been) — this is
   a genuine win from moving to a real backend.
3. **Synthesize** — triggered once all 12 `process-source` calls for a session have completed
   (each one checks, after writing its own result, whether it was the last one outstanding for
   that session — a simple `count(*)` against `SessionSource` vs. the expected total — and if so,
   calls `POST /api/research/[id]/synthesize` itself). One LLM call: reads all `Finding`s across
   the session's linked `Source`s, canonicalizes free-text `option` mentions into `Option` rows,
   ranks them, builds pros/cons, lists cross-source consensus vs. disputes (sponsored/affiliate
   findings shown separately, not silently excluded), surfaces dealbreakers, writes a
   plain-language verdict into `ResearchSession.verdictJson`, sets `status = "done"`.

**Cost/policy decisions (resolved now, not deferred to mid-build):**

| Question | Decision |
|---|---|
| LLM provider/model | Groq (`openai/gpt-oss-120b`) for extract+classify and synthesis — changed 2026-07-15, Claude Sonnet -> DeepSeek -> Groq same day, see §8. Chosen for free-tier API access. |
| Source cap | 12 sources/session — chosen for cost, not execution time (each source is its own bounded function call now, so the old "does it fit in one timeout" driver no longer applies, but the cost ceiling below still does). |
| Per-session cost ceiling | Was ~$0.50 soft budget under Claude Sonnet (≈13 calls: up to 12 extract+classify + 1 synthesis; search-query generation is one more LLM call, already counted in the search step). Groq's free tier for `openai/gpt-oss-120b` is 30 req/min, 1K req/day, 8K tokens/min, 200K tokens/day (as of 2026-07-15) rather than a dollar cost — the real constraint is now rate limits, not spend. 8K tokens/min is worth watching: extract+classify sends full source content per call and could approach that ceiling on longer sources. |
| Auto-exclude sponsored content? | No — label and show separately. |
| Search source | Jina Search (`s.jina.ai`) — changed 2026-07-15 from Google Custom Search API, see §2. |

## 3a. Async coordination without polling infrastructure

No job queue is being added (that would be over-engineering for this scale). The chaining pattern
is: each step's handler, on completion, either (a) is the terminal step and updates
`ResearchSession.status`, or (b) triggers the next step via a plain internal `fetch` call wrapped
in `waitUntil` so it isn't blocked on the response. The client polls
`GET /api/research/[id]` every ~2s (TanStack Query) to render live progress — same UX as the
original draft, just backed by Postgres reads instead of SQLite reads. Supabase Realtime
(subscribing to `research_sessions` row changes instead of polling) is a legitimate v1.1 upgrade
once this works, not a v1 requirement — polling is simpler to build and debug first.

## 4. Data Model (Prisma, Postgres/Supabase-valid)

Postgres has native `enum` and array types, unlike SQLite — the earlier `String`+`Json` workarounds
are no longer necessary and are reverted to proper Postgres types here. `Source` remains a global,
URL-deduped cache linked to sessions via a join table (unchanged reasoning: a shared cache can't
hold a single required `sessionId`, and `Finding`s belong to the `Source`, not the session, so a
cache hit skips the LLM call entirely).

```prisma
enum Platform {
  youtube
  reddit
  web
}

enum Sponsorship {
  organic
  sponsored
  affiliate
}

enum Sentiment {
  pro
  con
  neutral
}

model ResearchSession {
  id            String   @id @default(cuid())
  userId        String                        // Supabase Auth user id (auth.uid()) — see §4a
  query         String
  parsed        Json                          // {product, useCase, budget}
  status        String   @default("queued")   // queued|searching|fetching|extracting|synthesizing|done|failed
  expectedSources Int    @default(0)          // set at end of Search step; process-source calls compare against this to detect "last one done"
  verdictJson   Json?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  sources       SessionSource[]
  options       Option[]

  @@index([userId])
}

// join table: many sessions can share one cached Source
model SessionSource {
  sessionId String
  session   ResearchSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  sourceId  String
  source    Source          @relation(fields: [sourceId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())

  @@id([sessionId, sourceId])
  @@index([sourceId])
}

model Source {
  id                String      @id @default(cuid())
  url               String      @unique   // cache key — fetched + extracted once per 30-day window
  platform          Platform
  author            String?
  sponsorship       Sponsorship?
  sponsorConfidence Float?
  summary           String?
  createdAt         DateTime    @default(now())
  updatedAt         DateTime    @updatedAt  // drives the 30-day freshness check in §3 step 2
  sessions          SessionSource[]
  findings          Finding[]
}

model Finding {
  id        String    @id @default(cuid())
  sourceId  String
  source    Source    @relation(fields: [sourceId], references: [id], onDelete: Cascade)
  option    String               // free-text; canonicalized into Option rows at synthesis time
  claim     String
  sentiment Sentiment
  quote     String
  createdAt DateTime  @default(now())

  @@index([sourceId])
}

model Option {
  id        String   @id @default(cuid())
  sessionId String
  session   ResearchSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  name      String
  score     Float
  pros      String[]
  cons      String[]
  rank      Int
  createdAt DateTime @default(now())

  @@index([sessionId])
}
```

Deleting a `ResearchSession` cascades its `SessionSource` links and its own `Option` rows, but
never touches the underlying `Source`/`Finding` rows other sessions/users may still reference.
Deleting a `Source` directly (rare/manual) cascades its `Finding`s.

`TasteProfile` / `ProfileSelection` are **not part of the v1 schema** — see [§9](#9-v2-backlog-deferred-not-forgotten).

### 4a. Identity: Supabase Auth + Google Sign-In

Real accounts replace the earlier `deviceId`-cookie plan. **Supabase Auth's built-in Google OAuth
provider** is used directly (no separate auth library like NextAuth needed — one less dependency,
consistent with `ponytail`'s "don't add a package without a concrete reason"). Setup is a one-time
manual step, not application code: create a Google Cloud OAuth Client ID/Secret, register it in
the Supabase project's Auth → Providers → Google settings, add the Supabase callback URL as an
authorized redirect in Google Cloud Console.

`ResearchSession.userId` is populated from `auth.uid()` on every write. **Row-Level Security (RLS)
is enabled on `ResearchSession` and `Option`**, scoped to `auth.uid() = user_id`, so one user's
history is never visible to another — this is the real fix for the privacy gap the `deviceId`
cookie only partially addressed. `Source`/`Finding`/`SessionSource` remain readable across users
(the cache is intentionally shared content, not private data) but writable only via the service
role from server-side API routes, not directly from the client.

## 5. Proposed File Layout

```
raw/VerdictRoom/
  app/
    page.tsx                        # landing: single input + recent history (scoped by auth.uid())
    login/page.tsx                  # Google Sign-In via Supabase Auth
    research/[id]/page.tsx          # results dashboard (TanStack Query polling while running)
    api/
      research/route.ts             # POST: search step inline, fires process-source calls via waitUntil, returns id
      research/[id]/route.ts        # GET: session state + sources + findings
      research/[id]/process-source/route.ts  # POST: fetch+extract+classify one source; triggers synthesize if last
      research/[id]/synthesize/route.ts      # POST: final ranking + verdict
  lib/
    db.ts                           # Prisma client
    supabase/
      client.ts                     # browser Supabase client (auth)
      server.ts                     # server Supabase client (auth verification in API routes)
    llm.ts                          # Groq wrapper (extract+classify, synthesize)
    research/
      search.ts                     # query generation (LLM) + Jina Search dispatch
      fetch/
        youtube.ts                    # direct-fetch transcript retrieval
        web.ts                        # Jina Reader wrapper
        reddit.ts                     # public unauthenticated <permalink>.json fetch
      extract.ts                    # per-source structured extraction + sponsorship classification (merged)
      synthesize.ts                 # ranking + verdict + option canonicalization
  components/                     # shadcn/ui: Input, ReportCard, SourceList, Verdict, Progress
  prisma/schema.prisma
  DESIGN.md                       # design tokens (light/warm, retro-button aesthetic per global rules)
  AGENTS.md                       # project conventions for future sessions
  .env.local.example               # see §2 for the full secrets list
```

## 6. Milestones

| # | Milestone | Exit criteria |
|---|-----------|---------------|
| M1 | Scaffold | `bun dev` serves the landing page on Vercel-compatible Next.js 16; Prisma schema pushed to Supabase Postgres; Google Sign-In works end-to-end (login → session → logout) |
| M2 | Research core | Given a query, search → per-source process → synthesize chain (via `waitUntil`) completes end-to-end for a real query, writing to Supabase; cache-hit works on repeat URLs across sessions/users |
| M3 | Sponsor labeling | Sponsorship verdict shown per source (organic/sponsored/affiliate + confidence), excluded from consensus tally but visible in a separate "sponsored said" section |
| M4 | Synthesis + UI | Results dashboard: ranked options, sourced pros/cons, verdict, sponsored split; client polls `GET /api/research/[id]` for live progress |
| M5 | History + polish | Recent sessions listed (scoped by `auth.uid()` + RLS); responsive; DESIGN.md tokens applied |
| M6 | Deploy | Ship to Vercel; Supabase project provisioned (Postgres + Auth + Google provider configured); environment variables set in Vercel project settings |

(Still six milestones — the taste-profile milestone remains cut from v1 per §1; adding real auth
didn't reopen that scope decision.)

## 7. Build Discipline
- Run implementation sessions with the **`ponytail`** skill active to prevent over-engineering.
- Prefer native `fetch`/stdlib over new deps; the only heavyweight deps this plan actually needs
  are Prisma, `@supabase/supabase-js` (+ `@supabase/ssr` for Next.js server/client auth helpers),
  and `@vercel/functions` (for `waitUntil`).
- Lint/typecheck gates: `bun run lint`, `bun run build` green before each milestone close.
- No job queue, no Supabase Realtime, no token-metering system in v1 — all listed as explicit
  later upgrades (§3a, §2) precisely so they aren't quietly built now under scope creep.

## 8. Resolved Decisions

- **LLM provider/model:** Groq (`openai/gpt-oss-120b`) — see §3 table. Changed twice on
  2026-07-15 during deployment, both times at the user's request rather than an architectural
  driver: Claude Sonnet -> DeepSeek -> Groq, the last swap specifically for free-tier API access.
  `openai/gpt-oss-120b` is Groq's own recommended replacement for the now-deprecated
  `llama-3.3-70b-versatile` and has native tool-use support, which every call in `lib/llm.ts`
  depends on for a guaranteed response shape.
- **Source cap:** 12 sources/session — see §3 table.
- **Sponsored-content handling:** label + show separately, never silently auto-exclude — see §3 table.
- **Deploy target:** Vercel — see §2 for why this is now viable (Supabase-backed chained execution).
- **Database:** Supabase Postgres via Prisma — see §4.
- **Identity:** Supabase Auth, Google Sign-In only in v1 (no email/password, no other providers —
  smallest surface that satisfies "we need accounts now") — see §4a.
- **Search discovery:** Jina Search (`s.jina.ai`) — changed 2026-07-15 from Google Custom
  Search API, see §2.

## 9. V2 Backlog (deferred, not forgotten)

Explicit taste-profile personalization, cut from v1 for being speculative complexity ahead of any
evidence the core product gets reused (see §1). If v1 shows repeat usage, v2 adds:

- `TasteProfile` (priorities weights, dealbreakers, must-haves, excluded attributes) and
  `ProfileSelection` (upvote/downvote/musthave/dealbreaker/weight actions tied to a profile),
  scoped by `userId` (now trivial — real accounts already exist, unlike the original draft's
  speculative `deviceId` scoping question).
- Profile biasing search query generation, extraction relevance filtering, and ranking — with a
  user-visible "why this rank" explanation.
- Supabase Realtime instead of polling for live session status (§3a).
- A real job-queue/durable-workflow layer if the chained-`waitUntil` pattern (§3a) starts showing
  reliability problems at higher concurrency.
- ~~A fallback/second search source if the Google Custom Search free tier (§2) becomes a real
  bottleneck.~~ Done 2026-07-15 — swapped to Jina Search, see §2.
