<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# The Verdict Room — Project Conventions

**Plan of record:** `PLAN.md` at this directory's root — read it in full before implementing any
milestone. It carries the exact stack, Prisma schema, and pipeline architecture decisions, already
adversarially reviewed (see `ROAST.md`). Don't second-guess its architecture calls; if something
looks wrong, flag it rather than silently diverging.

## Stack

Next.js 16 (App Router) · TypeScript · Bun · Tailwind CSS 4 · shadcn/ui · TanStack Query
· Prisma (Postgres, targeting Supabase) · Supabase Auth (Google Sign-In only) · `@vercel/functions`
(`waitUntil` for the chained research pipeline) · Groq (`openai` SDK pointed at Groq's
OpenAI-compatible endpoint, `openai/gpt-oss-120b`, from M2 — see PLAN.md §8 for why this replaced
Claude then DeepSeek) · Jina Search (`s.jina.ai`, from M2 — see PLAN.md §2 for why this replaced
Google Custom Search 2026-07-15).

Prisma is pinned to **v6** (`prisma`/`@prisma/client` `^6`), not the current v7. Prisma 7 removed
`url`/`directUrl` from the `datasource` block in favor of a `prisma.config.ts` + driver-adapter
pattern (`@prisma/adapter-pg` etc.) — an extra dependency PLAN.md doesn't scope. v6 keeps the
classic `url`/`directUrl` schema fields, matching the plan's "standard Supabase Prisma setup
pattern" and the project's YAGNI discipline (§7 of PLAN.md). Revisit this pin if a future milestone
has a concrete reason to need v7.

## Running it

```bash
bun install          # install dependencies
bun dev               # dev server — http://localhost:3000
bun run build         # production build
bunx prisma validate  # check schema syntax (no live DB needed)
bunx prisma generate  # regenerate the Prisma client after schema changes
bunx prisma db push   # push schema to Supabase — DO NOT run until a real Supabase project + DATABASE_URL/DIRECT_URL exist
```

`bunx shadcn@latest add <component>` to add more shadcn/ui components as needed.

## Environment

Copy `.env.local.example` to `.env.local` and fill in real values — never commit `.env.local`.
See PLAN.md §2 for what each secret is and where it comes from. A live Supabase project (Postgres
+ Auth + Google OAuth provider configured) is required before `db push`, login, or the research
pipeline can be exercised end-to-end — that provisioning is a manual dashboard step per PLAN.md
§4a, not something a coding session does.

## Design

`DESIGN.md` at this directory's root has the token/typography/button-style rationale. Tokens are
wired live in `app/globals.css` (`:root`/`.dark`) and `components/ui/button.tsx` — treat that CSS
as the source of truth if this doc and the code ever drift.

## Milestones

Six milestones tracked in PLAN.md §6 (Scaffold -> Research core -> Sponsor labeling -> Synthesis +
UI -> History + polish -> Deploy). Each milestone's exit criteria are stated there — don't start
the next milestone's scope inside another one's PR/session.
