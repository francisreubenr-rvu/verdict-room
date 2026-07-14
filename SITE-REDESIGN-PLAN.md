# SITE-REDESIGN-PLAN.md — Warm Clay redesign + billing

Plan of record for implementing the Claude Design project "Purchase Pilot Website Design"
(`PurchasePilot Site.dc.html`, 8 screens) into this codebase. Supplements `PLAN.md` (product/pipeline
plan of record) and `DESIGN.md` (design tokens) rather than replacing them — `PLAN.md`'s pipeline
architecture (M1-M6) is untouched; this adds a visual redesign + a new billing milestone.

## Decisions locked in with the user before starting

- **Login**: Google Sign-In only, restyled. The design's magic-link email input is dropped — no
  email-auth backend exists and PLAN.md §4a deliberately scoped v1 to Google-only.
- **Pricing/billing**: Real Stripe subscription (not a static mockup). Free vs Pro is a real gated
  tier.
- **Usage counter**: Real, backed by an actual DB count — not the fabricated "2 of 3" from the
  design copy.
- **Pro perks — billing + quota only.** Of the 5 Pro perks in the design copy, only "unlimited
  reports" gets built for real (quota lifted). The other 4 stay as marketing copy, NOT implemented:
  - 200-source "deep dive" mode (would blow past PLAN.md's ~$0.50/session cost ceiling)
  - Markdown/PDF export
  - Price-drop watch (needs a monitoring subsystem that doesn't exist)
  - "Front of the queue" priority (meaningless — PLAN.md deliberately has no job queue)

## Screen -> route map

| Design screen | Route | Notes |
|---|---|---|
| Landing | `/` (was the app query-home) | New marketing page, hero demo animation is decorative/illustrative, not real data |
| How it works | `/how-it-works` | New, static |
| Pricing | `/pricing` | New — real plan cards, FAQ accordion, wired to real Stripe checkout |
| About | `/about` | New, static |
| App — Query home | `/app` (was `/`) | Existing real functionality (recent sessions, submit query), restyled + real usage counter |
| App — Progress | `/research/[id]` (status != done) | Existing real polling, restyled |
| App — Final report | `/research/[id]` (status == done) | Existing real data, restyled |
| Login | `/login` | Google-only, restyled |
| Component library | `/components` | New, static design-system swatch/reference page |

Persistent floating pill nav (logo, How it works / Pricing / About / Components / Sign in-out /
Start free) renders on every route via a shared component. Footer varies: full 4-column marketing
footer on marketing pages, compact one-line footer on app pages (matches the design's
`isMarketing`/`isAppFoot` split).

## Stage A — Design system migration (Warm Clay)

Supersedes the current flat neobrutalist tokens (2px ink borders, hard offset shadows) with the
new claymorphic system (soft layered inset/outset shadows, pill rounding 14-34px, gradient
buttons). Source of truth: `app/globals.css` + `DESIGN.md`, per existing project convention.

- `app/globals.css` — new palette (paper `#f2e8d5`, card `#f8f0dd`, well `#efe3c8`, chip `#f4ecd8`,
  terracotta gradient `#c96a45`->`#a84a28`, ochre gradient `#e2c98f`->`#c9a558`, rust gradient
  `#b5533f`->`#8f3325`, ink slab gradient `#3a2d1d`->`#2b2116`) + shadow custom properties.
- `components/ui/button.tsx` — rewrite variants (primary clay gradient, secondary raised, quiet
  dashed-outline, destructive) with press-state (hover translateY(1px), active translateY(3px)
  scale + inset shadow).
- `components/ui/card.tsx` — raised / well / ink surface variants.
- `components/ui/badge.tsx` — clay pill sponsorship/status badges.
- New `components/reveal.tsx` — IntersectionObserver fade+rise-once wrapper (mirrors the design's
  `data-reveal` behavior), respects `prefers-reduced-motion`.
- Evolve `components/site-header.tsx` into the full nav bar (keep its existing auth-state logic
  from the M5 commit, add nav links + active-state + Start free CTA).
- New `components/footer.tsx` (`variant: "marketing" | "app"`).
- Rewrite `DESIGN.md` to document Warm Clay as the current system.

## Stage B — Routes

- `app/app/page.tsx` (new `/app` route) <- move current `app/page.tsx` content, restyle, wire real
  usage counter (see Stage C).
- `app/page.tsx` -> replaced with new marketing Landing.
- `app/how-it-works/page.tsx`, `app/pricing/page.tsx`, `app/about/page.tsx`,
  `app/components/page.tsx` — new static pages (Pricing has client-side FAQ accordion + real
  checkout wiring).
- `app/login/page.tsx` — restyle, Google-only.
- `app/research/[id]/page.tsx` + `progress-tracker.tsx` + `report-card.tsx` + `source-list.tsx` +
  `verdict.tsx` — restyle only, all existing data-fetching/polling logic untouched.

## Stage C — Billing + real usage quota

- `prisma/schema.prisma` — new `Subscription` model: `userId` (unique), `plan` (enum free/pro),
  `stripeCustomerId`, `stripeSubscriptionId`, `status`, `currentPeriodEnd`, timestamps.
- `lib/stripe.ts` — server-side Stripe client (`STRIPE_SECRET_KEY`).
- `app/api/billing/checkout/route.ts` — POST, auth required, creates/reuses Stripe customer,
  creates a Checkout Session for the Pro monthly price, returns redirect URL.
- `app/api/billing/portal/route.ts` — POST, auth required, Stripe Billing Portal session (so Pro
  users can cancel — necessary counterpart to subscribing, not in the design but required for a
  real subscription to be safe to ship).
- `app/api/billing/webhook/route.ts` — verifies Stripe signature, handles
  `checkout.session.completed` / `customer.subscription.updated` / `customer.subscription.deleted`
  to keep `Subscription` in sync.
- `app/api/research/route.ts` POST — quota check before creating a session: free plan capped at 3
  `ResearchSession`s per calendar month; exception matching the Pricing FAQ's existing promise
  ("re-running the same query within 24h is free") — same user + same normalized query within 24h
  returns the existing session instead of creating a new one or consuming quota. Pro = unlimited.
  Over-quota returns 402 with a clear message.
- `app/api/research/route.ts` GET — response gains a real `usage: { plan, used, limit }` object for
  `/app` to render instead of the design's fabricated "2 of 3" copy.
- `package.json` — add `stripe` (official SDK), single new dependency.
- `.env.local.example` + `DEPLOY.md` — new "j. Stripe" section (manual dashboard steps: create
  account, create the $12/mo recurring Price, webhook endpoint + signing secret), matching this
  project's existing pattern for Supabase/Google/Anthropic/Google-Search setup.

None of Stage C can be exercised end-to-end without live Stripe + Supabase credentials (same
constraint as the rest of this project per `DEPLOY.md` — no `.env.local` exists). Code is built and
`bun run build`/`lint`-verified; live checkout/webhook flow is a manual verification step once the
user provisions Stripe, same as every other external service in this project.

## Progress checklist

- [x] Stage A: design system migration
- [x] Stage B: routes (landing, how-it-works, pricing, about, components, app, login, research/[id] restyle)
- [x] Stage C: billing + quota
- [x] Build/lint verification + live visual check (desktop + mobile) of new pages
- [x] DEPLOY.md / .env.local.example updated for Stripe (§h, renumbered i/j for Vercel/Deploy)
- [x] Rebrand: PurchasePilot -> The Verdict Room (name chosen via wiki/branding/ methodology,
  directory renamed `raw/PurchasePilot` -> `raw/VerdictRoom`, every product-facing string updated)

All done. Notes from implementation:
- Stripe client (`lib/stripe.ts`) had to be a lazy singleton (`getStripe()`), not a module-level
  eager instantiation — matches the same crash class already hit once with the Supabase browser
  client in the M5 session (constructing with an undefined API key at import time breaks Next.js's
  build-time page-data collection, which imports every route module).
- Pricing page's Pro card originally looked sparse with only 1 real perk listed vs Free's 4 — added
  one honest explanatory line instead of the temptation to pad with more (fake) feature bullets.
- Reveal-on-scroll verified via actual Playwright scroll simulation, not just a fullPage screenshot
  (which never triggers IntersectionObserver — a capture artifact, not a real bug, but worth
  distinguishing before reporting something as broken).
