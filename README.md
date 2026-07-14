# The Verdict Room

> One input in. Hours of review-watching and review-reading, distilled into a verdict you can trust.

Takes a single natural-language purchase query (e.g. "Best noise-cancelling headphones under $300
for travel, I have an iPhone") and returns a synthesized, sourced report: ranked options, evidence
with links, a sponsored-vs-organic split, common complaints, and a final verdict.

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router), TypeScript, Bun |
| UI | Tailwind CSS 4, shadcn/ui, Zustand, TanStack Query |
| Data | Prisma → Supabase Postgres |
| Auth | Supabase Auth (Google Sign-In only) |
| LLM | Anthropic Claude (`@anthropic-ai/sdk`) |
| Search | Google Custom Search API |
| Deploy | Vercel (`@vercel/functions` `waitUntil` for the chained research pipeline) |

## Running locally

```bash
bun install
cp .env.local.example .env.local   # fill in real values — see PLAN.md §2 for what each secret is
bunx prisma generate
bun dev                             # http://localhost:3000
```

A live Supabase project (Postgres + Auth + Google OAuth provider configured) is required before
`bunx prisma db push`, login, or the research pipeline work end-to-end — that's a manual dashboard
step, not something `bun dev` provisions for you.

## Docs

| File | Contents |
|---|---|
| `PLAN.md` | Architecture, data model, pipeline design, milestones — plan of record |
| `AGENTS.md` | Project conventions for anyone (human or agent) working in this repo |
| `DESIGN.md` | Design tokens, typography, spacing — source of truth is `app/globals.css` if they drift |
