# DEPLOY.md — The Verdict Room M6 Manual Checklist

This project has never been deployed. There is no live Supabase project, no `.env.local`, no
Vercel project, and no real API credentials anywhere. Everything in this checklist is a manual
step a human does in a dashboard or terminal — no coding agent should run `bunx prisma db push`,
`vercel deploy`, or create any of these accounts on your behalf. Work top to bottom; later steps
depend on values captured in earlier ones.

Config-side prerequisites are already done: `@vercel/functions` (`waitUntil`) is in
`package.json`, `next.config.ts` needs no Vercel-specific options for standard App Router deploys,
and `package.json` now has a `"postinstall": "prisma generate"` script so the Prisma Client
regenerates on every Vercel install (Prisma's documented Vercel pattern — belt-and-suspenders on
top of the `trustedDependencies` bun already has for `prisma`/`@prisma/client`/`@prisma/engines`).

---

## a. Supabase project + Postgres connection strings

1. Go to https://supabase.com/dashboard → **New project**. Name it (e.g. `the-verdict-room`), set a
   database password (save it — you'll need it in the connection strings below), pick a region.
2. Once provisioned: **Project Settings → Database → Connection string**.
3. Copy the **pooled** connection string (dropdown/tab labeled "Transaction pooler", port `6543`)
   → this is `DATABASE_URL`. Append `?pgbouncer=true` if it isn't already there — Prisma needs
   that flag to disable prepared statements over the pooler connection.
4. For `DIRECT_URL`, **use the "Session pooler" tab (port `5432`), NOT "Direct connection".**
   Confirmed live: the raw "Direct connection" host (`db.<project-ref>.supabase.co`) is IPv6-only
   and fails with `P1001: Can't reach database server` on any network without outbound IPv6 —
   which is most home/ISP networks. "Session pooler" uses the same pooler host as step 3
   (`aws-<n>-<region>.pooler.supabase.com`) on port `5432` instead, and is IPv4-compatible.
5. Substitute your real database password into both (replace `[YOUR-PASSWORD]`).
6. **Project Settings → API** → copy the **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`, and the
   **anon/public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

Enter all four values into `.env.local` (step f).

---

## b. Google Cloud OAuth Client + Supabase Google provider

1. https://console.cloud.google.com/ → create/select a project → **APIs & Services → Credentials**.
2. **Create Credentials → OAuth client ID** → Application type **Web application**.
3. You need the Supabase callback URL *before* finishing this form:
   `https://<your-project-ref>.supabase.co/auth/v1/callback` (find `<your-project-ref>` in the
   Supabase project URL from step a.6). Add it under **Authorized redirect URIs**.
4. Save → copy the generated **Client ID** and **Client Secret**.
5. In the Supabase dashboard: **Authentication → Providers → Google** → toggle it on, paste the
   Client ID and Client Secret, save.
6. These two values are entered **only in the Supabase dashboard** — the app does not read
   `GOOGLE_OAUTH_CLIENT_ID`/`SECRET` as env vars (per PLAN.md §4a). Do not add them to
   `.env.local` or Vercel.

---

## c. Jina — search discovery + web content fetching

**Replaced 2026-07-15** (see `lib/research/search.ts` for why): Google Custom Search required
enabling the Custom Search JSON API on the exact Google Cloud project the API key belonged to — a
step that got missed at launch and silently failed every research session with no clear error
until diagnosed against Vercel runtime logs. Jina was already an existing vendor relationship
(`lib/research/fetch/web.ts` uses Jina Reader for content fetching), so this reuses one key
instead of adding a new one.

1. https://jina.ai/api-dashboard/ → sign up (self-serve, no card required) → copy the
   auto-generated API key → `JINA_API_KEY`.
2. This single key authenticates both `s.jina.ai` (search discovery,
   `lib/research/search.ts`) and `r.jina.ai` (content fetching, `lib/research/fetch/web.ts`) —
   they draw from one shared token pool, billed per-token rather than per-request (search
   requests are a minimum ~10,000 tokens each regardless of actual usage, per Jina's docs).
3. No free-tier request count is published the way Google's 100/day was — watch actual usage at
   the dashboard above once live, and revisit if it becomes a bottleneck (PLAN.md §2 already
   named a paid tier or a second search source as the next options if so).

---

## d. Reddit — no setup needed

**Changed 2026-07-15:** originally specified an OAuth2 client-credentials grant requiring a
registered Reddit account + script app (see git history for the old version of this step). Hit
signup friction during deployment, so `lib/research/fetch/reddit.ts` now fetches Reddit's public,
unauthenticated `<permalink>.json` endpoints instead — no Reddit account, no env vars, nothing to
do here. Trade-off accepted: stricter/undocumented unauthenticated rate limits vs. the OAuth tier,
fine at this project's request volume. Revisit if Reddit starts throttling/blocking the requests.

---

## e. Groq API key

**Changed 2026-07-15 twice** — Claude/Anthropic -> DeepSeek -> Groq, same day, for free-tier API
access. See PLAN.md §8.

1. https://console.groq.com/ → sign up/log in → **API Keys** (left sidebar) → **Create API Key**.
2. Copy it → `GROQ_API_KEY`.
3. Model used is `openai/gpt-oss-120b` (Groq's own recommended replacement for the deprecated
   `llama-3.3-70b-versatile`, chosen for native tool-use support). Free-tier limits as of
   2026-07-15: 30 requests/min, 1,000 requests/day, 8,000 tokens/min, 200,000 tokens/day. The
   research pipeline makes ~13 calls/session (search-query generation, up to 12 extract+classify,
   1 synthesis per PLAN.md §3) — the 1K/day request cap is the one most likely to bite first at
   real usage; the 8K tokens/min cap is worth watching too since extract+classify sends full
   source content per call.

---

## f. Local env file + push schema

```bash
cd "/Volumes/1TB SSD/brain/raw/VerdictRoom"
cp .env.local.example .env.local
```

Fill in every value in `.env.local` from steps a, c, e above (step d needs no value — Reddit fetch
is unauthenticated; Google OAuth Client ID/Secret from step b are *not* entered here either — they
live only in the Supabase dashboard; the `STRIPE_*` values come later, from step h).

**Before running any Prisma command:** `.env.local` is a Next.js-only convention — the Prisma CLI
doesn't know about it and reads a plain `.env` file instead (confirmed live: `db push` fails with
"Environment variable not found: DIRECT_URL" even with a fully-populated `.env.local`, because
Prisma simply never loaded it). Symlink one to the other so there's a single source of truth:

```bash
ln -s .env.local .env     # both .env and .env.local are gitignored, safe either way
```

Then:

```bash
bunx prisma db push       # pushes prisma/schema.prisma to the real Supabase Postgres DB
```

This is the first point at which real infrastructure gets touched — do not run it until every
value in `.env.local` is real. After this succeeds, restart `bun dev` if it was already running
(env vars don't reach an already-running process).

---

## g. Row-Level Security (manual — not yet defined anywhere in this repo)

**Checked:** no `.sql` file, Prisma migration, or setup script in this repo defines RLS policies —
`prisma/schema.prisma` and `prisma db push` do not create them (Prisma has no RLS DSL). **This SQL
must be run by hand in the Supabase dashboard's SQL Editor after `db push` has created the
tables:**

**Corrected 2026-07-15 (post-launch security review):** this section used to say the app-layer
`userId` filters in `app/api/research/route.ts`/`[id]/route.ts` were "defense in depth only"
because RLS was "the real enforcement." That was verified false against the live database:
`DATABASE_URL`'s pooled connection authenticates as the `postgres` role, which owns these tables
and therefore bypasses RLS by default (confirmed via `select rolbypassrls from pg_roles where
rolname = current_user` — returns `true`). Separately, `auth.uid()` — the function every policy
below keys off — only resolves from a JWT claim that PostgREST sets; a raw Prisma connection never
sets it, so it reads `NULL` on every query Prisma runs, which would deny all access if RLS somehow
weren't bypassed. **The RLS policies below are still worth applying** (a real second layer if
`DATABASE_URL` is ever swapped to a non-owner role, and correct protection for any future
client-side Supabase query against these tables), but do not treat them as active protection today
— the app-layer `userId`/`auth.getUser()` checks in every route are the only enforcement that
currently exists, so never remove one of those checks on the assumption RLS has it covered.

```sql
alter table "ResearchSession" enable row level security;
alter table "Option" enable row level security;

create policy "Users can access their own research sessions"
  on "ResearchSession"
  for all
  using (auth.uid()::text = "userId")
  with check (auth.uid()::text = "userId");

create policy "Users can access options on their own sessions"
  on "Option"
  for all
  using (
    exists (
      select 1 from "ResearchSession"
      where "ResearchSession".id = "Option"."sessionId"
        and auth.uid()::text = "ResearchSession"."userId"
    )
  )
  with check (
    exists (
      select 1 from "ResearchSession"
      where "ResearchSession".id = "Option"."sessionId"
        and auth.uid()::text = "ResearchSession"."userId"
    )
  );

alter table "Subscription" enable row level security;

create policy "Users can access their own subscription"
  on "Subscription"
  for all
  using (auth.uid()::text = "userId")
  with check (auth.uid()::text = "userId");
```

`Subscription` added 2026-07-15 — this table didn't exist when the RLS SQL above was first
written (it's from the later Stripe billing pass), but it's private per-user billing data just
like `ResearchSession`/`Option`, so it gets the same policy shape rather than being silently left
without RLS.

`Source`, `Finding`, and `SessionSource` intentionally stay **without** RLS (PLAN.md §4a: the cache
is shared content, writable only via the service-role key from server-side API routes).

---

## h. Stripe — SKIPPED (not available for India-based merchants)

**Skipped 2026-07-15.** Stripe doesn't support standard merchant accounts based in India, which
rules it out as-is. The Pricing page's Pro card now ships as a disabled "Coming soon" state (no
live checkout button) rather than a broken one — see the pricing page commit for that change. The
billing routes (`app/api/billing/*`), `Subscription` Prisma model + RLS policy, and `lib/stripe.ts`
all still exist in the codebase, dormant and harmless, for whenever a payment processor that
supports Indian merchants is wired in (Razorpay, Lemon Squeezy, and Paddle all do — none of these
have been evaluated yet, this is just naming the option space, not a recommendation).

**Manual pro grants ("comped" accounts):** with checkout not live, `lib/billing.ts`'s
`getPlanForUser` treats `Subscription.status === "comped"` the same as a real Stripe `"active"`
subscription. To grant an account pro access by hand: find their Supabase auth user id
(`select id from auth.users where email = '...'`, via a Prisma raw query — `DATABASE_URL`
connects with access to the `auth` schema too, not just `public`), then upsert a `Subscription`
row with `plan: "pro"`, `status: "comped"`, and a placeholder `stripeCustomerId` (e.g.
`comp_<userId>` — the column is required + unique but there's no real Stripe customer to
reference; using a non-`cus_`-prefixed value avoids ever colliding with a real one later). First
used 2026-07-15 to grant `francisreubenrbtech25@rvu.edu.in` pro access on request.

No `STRIPE_*` env vars are needed anywhere (local `.env.local` or Vercel) until this is revisited.

---

## i. Vercel project + environment variables

1. https://vercel.com/new → import this Git repository (push it to GitHub/GitLab first if it isn't
   already remote — confirmed via the Vercel MCP `list_projects` tool that no project named
   `purchasepilot`, `the-verdict-room`, or similar exists yet under this account's team, so this
   is a first-time import, not a re-link).
2. Framework preset: Vercel auto-detects Next.js — no override needed.
3. Root directory: point it at this folder (`raw/VerdictRoom`) if the repo root isn't already
   this directory.
4. **Project Settings → Environment Variables** — add every key from `.env.local.example`, with the
   real values from steps a/c/e (same values as your local `.env.local`, not the Google OAuth
   Client ID/Secret — those stay Supabase-dashboard-only; no Reddit vars exist per step d; no
   `STRIPE_*` vars exist per step h):
   - `GROQ_API_KEY`
   - `JINA_API_KEY`
   - `DATABASE_URL`
   - `DIRECT_URL`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `INTERNAL_PIPELINE_SECRET` (added 2026-07-15 — generate with `openssl rand -hex 32`; required
     in production or `process-source`/`synthesize` hard-fail with 500, see `.env.local.example`)
   Apply each to Production (and Preview/Development if you want preview deploys to work too).
5. In Google Cloud Console (step b), add the production Vercel domain's callback flow: Supabase
   Auth already handles the OAuth redirect via its own callback URL (already authorized in step
   b.3), so no additional Google Cloud change is needed for the Vercel domain itself — but confirm
   **Supabase → Authentication → URL Configuration → Site URL / Redirect URLs** includes your real
   production Vercel URL (e.g. `https://the-verdict-room.vercel.app`) once you know it, or Supabase
   will redirect post-login back to `localhost`.

---

## j. Deploy

1. Trigger the first deploy (push to the connected branch, or **Deploy** from the Vercel dashboard
   import screen).
2. Watch the build log for the `prisma generate` postinstall step and a clean `next build`.
3. Once live, sign in with Google end-to-end, run one real research query, and confirm a session
   completes (`queued → ... → done`) and rows land in Supabase (`ResearchSession`, `Source`,
   `Finding`, `Option`).
4. Stripe production webhook step skipped — see step h (Stripe skipped, not available for
   India-based merchants). The Pricing page's Pro card is a static "Coming soon" state; there's
   no checkout flow to smoke-test.
5. If anything fails at runtime with an auth/DB error, re-check step g (RLS policy) and step i.5
   (Site URL) first — those are the two steps most likely to silently pass a build but fail at
   runtime.
