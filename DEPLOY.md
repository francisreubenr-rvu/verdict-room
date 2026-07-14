# DEPLOY.md — PurchasePilot M6 Manual Checklist

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

1. Go to https://supabase.com/dashboard → **New project**. Name it (e.g. `purchasepilot`), set a
   database password (save it — you'll need it in the connection strings below), pick a region.
2. Once provisioned: **Project Settings → Database → Connection string**.
3. Copy the **pooled** connection string (port `6543`, `?pgbouncer=true`) → this is `DATABASE_URL`.
4. Copy the **direct** connection string (port `5432`) → this is `DIRECT_URL`.
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

## c. Google Programmable Search Engine + Custom Search API key

1. https://programmablesearchengine.google.com/ → **Add** → configure a search engine that
   searches the entire web (not a specific site list). Save it and copy the **Search engine ID**
   (this is `GOOGLE_CUSTOM_SEARCH_CX`).
2. https://console.cloud.google.com/apis/credentials (same Google Cloud project as step b is fine)
   → **Enable APIs and Services** → search "Custom Search API" → **Enable**.
3. On the same Credentials page → **Create Credentials → API key** → copy it
   (`GOOGLE_CUSTOM_SEARCH_API_KEY`). Optionally restrict the key to the Custom Search API.
4. **Free tier is 100 queries/day, shared across the whole app** (PLAN.md §2) — at 3-5 search
   calls per research session that's roughly 20-30 sessions/day before the quota trips. Expected
   for v1; no fallback is built. If you exceed it, Google returns HTTP 429 until the quota resets.

---

## d. Reddit script app (OAuth2 client-credentials)

1. https://www.reddit.com/prefs/apps (logged in) → **create another app...** at the bottom.
2. Name it, select type **script**, set the "redirect uri" to anything valid
   (e.g. `http://localhost:3000` — unused by the client-credentials grant, but required by the form).
3. After creating: the string under the app name (below the icon) is `REDDIT_CLIENT_ID`; the
   "secret" field is `REDDIT_CLIENT_SECRET`.

---

## e. Anthropic API key

1. https://console.anthropic.com/settings/keys → **Create Key**.
2. Copy it → `ANTHROPIC_API_KEY`. Make sure the account has billing/credits attached — the
   research pipeline makes real Claude calls (search-query generation, per-source extract+classify,
   synthesis; ~13 calls/session, ~$0.50 soft budget per PLAN.md §3).

---

## f. Local env file + push schema

```bash
cd "/Volumes/1TB SSD/brain/raw/PurchasePilot"
cp .env.local.example .env.local
```

Fill in every value in `.env.local` from steps a, c, d, e above (Google OAuth Client ID/Secret from
step b are *not* entered here — they live only in the Supabase dashboard; the `STRIPE_*` values
come later, from step h). Then:

```bash
bunx prisma db push       # pushes prisma/schema.prisma to the real Supabase Postgres DB
```

This is the first point at which real infrastructure gets touched — do not run it until every
value in `.env.local` is real. After this succeeds, restart `bun dev` if it was already running
(env vars don't reach an already-running process).

---

## g. Row-Level Security (manual — not yet defined anywhere in this repo)

**Checked:** no `.sql` file, Prisma migration, or setup script in this repo defines RLS policies —
`prisma/schema.prisma` and `prisma db push` do not create them (Prisma has no RLS DSL). The
application code already assumes RLS is the real enforcement layer (see the comments in
`app/api/research/route.ts` and `app/api/research/[id]/route.ts` — the `userId` filters there are
called out as "defense in depth only"). **This SQL must be run by hand in the Supabase dashboard's
SQL Editor after `db push` has created the tables:**

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
```

`Source`, `Finding`, and `SessionSource` intentionally stay **without** RLS (PLAN.md §4a: the cache
is shared content, writable only via the service-role key from server-side API routes). Verify
`DATABASE_URL` in `.env.local`/Vercel uses the standard `postgres` role (not `service_role`) so RLS
actually applies to app traffic on `ResearchSession`/`Option`.

---

## h. Stripe — Pro subscription billing

Real subscription billing (SITE-REDESIGN-PLAN.md §Stage C), not a mockup — the Pricing page's
"Go Pro" button hits real Stripe Checkout, and a webhook keeps plan status in sync.

1. https://dashboard.stripe.com/register → create an account (use **test mode** for local dev;
   switch to live keys only once ready to actually charge people).
2. **Product catalog → Add product** → name it (e.g. "PurchasePilot Pro"), add a **recurring**
   price: $12.00/month. Copy the **Price ID** (`price_...`, not the Product ID) → `STRIPE_PRO_PRICE_ID`.
3. **Developers → API keys** → copy the **Secret key** (`sk_test_...` in test mode) → `STRIPE_SECRET_KEY`.
4. **Developers → Webhooks → Add endpoint** → URL: `https://<your-domain>/api/billing/webhook`
   (for local testing, use the Stripe CLI: `stripe listen --forward-to localhost:3000/api/billing/webhook`,
   which prints a `whsec_...` you can use locally without a public URL). Select events:
   `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`.
   Copy the **Signing secret** (`whsec_...`) → `STRIPE_WEBHOOK_SECRET`.
5. Enter all three values into `.env.local` (or Vercel env vars — step i).

To test a subscription end-to-end without a real card: Stripe test mode accepts `4242 4242 4242
4242` with any future expiry/CVC on the Checkout page.

---

## i. Vercel project + environment variables

1. https://vercel.com/new → import this Git repository (push it to GitHub/GitLab first if it isn't
   already remote — confirmed via the Vercel MCP `list_projects` tool that no project named
   `purchasepilot` or similar exists yet under this account's team, so this is a first-time import,
   not a re-link).
2. Framework preset: Vercel auto-detects Next.js — no override needed.
3. Root directory: point it at this folder (`raw/PurchasePilot`) if the repo root isn't already
   this directory.
4. **Project Settings → Environment Variables** — add every key from `.env.local.example`, with the
   real values from steps a/c/d/e (same values as your local `.env.local`, not the Google OAuth
   Client ID/Secret — those stay Supabase-dashboard-only):
   - `ANTHROPIC_API_KEY`
   - `GOOGLE_CUSTOM_SEARCH_API_KEY`
   - `GOOGLE_CUSTOM_SEARCH_CX`
   - `DATABASE_URL`
   - `DIRECT_URL`
   - `REDDIT_CLIENT_ID`
   - `REDDIT_CLIENT_SECRET`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `STRIPE_SECRET_KEY`
   - `STRIPE_PRO_PRICE_ID`
   - `STRIPE_WEBHOOK_SECRET` (the production Stripe CLI/dashboard webhook endpoint's signing
     secret — different from the local `stripe listen` one in step h.4)
   Apply each to Production (and Preview/Development if you want preview deploys to work too).
5. In Google Cloud Console (step b), add the production Vercel domain's callback flow: Supabase
   Auth already handles the OAuth redirect via its own callback URL (already authorized in step
   b.3), so no additional Google Cloud change is needed for the Vercel domain itself — but confirm
   **Supabase → Authentication → URL Configuration → Site URL / Redirect URLs** includes your real
   production Vercel URL (e.g. `https://purchasepilot.vercel.app`) once you know it, or Supabase
   will redirect post-login back to `localhost`.

---

## j. Deploy

1. Trigger the first deploy (push to the connected branch, or **Deploy** from the Vercel dashboard
   import screen).
2. Watch the build log for the `prisma generate` postinstall step and a clean `next build`.
3. Once live, sign in with Google end-to-end, run one real research query, and confirm a session
   completes (`queued → ... → done`) and rows land in Supabase (`ResearchSession`, `Source`,
   `Finding`, `Option`).
4. Add a **production** webhook endpoint in the Stripe dashboard (step h.4) pointing at
   `https://<your-real-domain>/api/billing/webhook` — the local `stripe listen` one only covers
   dev. Run a test Pro subscription end-to-end (test card `4242 4242 4242 4242`) and confirm the
   `Subscription` row flips to `plan: pro`.
5. If anything fails at runtime with an auth/DB error, re-check step g (RLS policy) and step i.5
   (Site URL) first — those are the two steps most likely to silently pass a build but fail at
   runtime.
