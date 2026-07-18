# Roast Loop — VerdictRoom codebase — 2026-07-18

Target: the live codebase (app/, lib/, components/, prisma/) as deployed at
verdict-room.vercel.app (commit 07bbe4e). Prior loop (2026-07-11, archived at
ROAST-2026-07-11-plan.md.archive) targeted PLAN.md before code existed — this is the
first roast of the real implementation.

Context the roasters should NOT re-report as findings (known, deliberate, or already
adjudicated):
- Reddit fetch returning zero content on the Browserbase Free plan is a documented
  plan limitation (needs Proxies/Verified Sessions), not a code bug.
- `fetchYoutubeTranscript` returning `author: null` always is a documented trade-off
  of the youtube-caption-extractor swap.
- Prisma is pinned to v6 deliberately (AGENTS.md).
- The 2026-07-17 review pass already fixed: backfill single-candidate race, terminal-
  status orphaned SourceAttempt rows, attempt-list tab filter mismatch, findings
  maxItems/length bounds, synthesize truncation bounds.

## Round 1
### Findings (open)
(none open)

### Fixed
- [x] app/api/research/route.ts BLOCKER — quota re-check now excludes the current session from its own count. `countReportsThisMonth` (lib/billing.ts) takes an optional `excludeSessionId` param added to the `where` as `id: { not: excludeSessionId }` only when provided; the re-check call site in `continueSearch` passes `sessionId`. Comment above the re-check updated to explain the exclusion.
- [x] app/api/research/[id]/synthesize/route.ts SIGNIFICANT — added a zero-findings guard before calling `synthesize()`: if `findings.length === 0`, flip the session to `status: "failed", failureReason: "no_findings"` via a conditional `updateMany` (`status: "synthesizing"`) and return without synthesizing. Added `"no_findings"` to `FailureReason` and `FAILURE_MESSAGES` in components/research-types.ts.
- [x] app/research/[id]/page.tsx + both GET routes SIGNIFICANT — (a) failed-session branch now renders the failure message plus `AttemptList` below it when `data.attempts.length > 0`, instead of early-returning past it. (b) Both staleness reaps now close out non-terminal `SourceAttempt` rows: app/api/research/[id]/route.ts's single-session reap adds a `sourceAttempt.updateMany` scoped to that session's id; app/api/research/route.ts's list-route reap first selects the stale session ids via `findMany`, then updates `ResearchSession` and `SourceAttempt` (`sessionId: { in: staleIds } }`) for the affected set, both setting `status: "failed", failureReason: "session_ended"`.
- [x] app/page.tsx:273 MINOR — pricing teaser copy now says "10 reports a month," matching the hero copy and `FREE_MONTHLY_REPORT_LIMIT`.
- [x] app/api/billing/checkout/route.ts:49 MINOR — removed the dead `client_reference_id: user.id` parameter from the Stripe Checkout Session creation call.

## Round 2
Adversarial re-verification of the Round 1 fixes only (diff vs commit 07bbe4e), not a full
re-audit. Fixes 1 (quota off-by-one), 2 (zero-findings guard), 4 (copy), and 5 (dead param) hold
as implemented. Fix 3's list-route reap restructure introduced a new race.

### Findings (open)
(none — all fixed)

### Fixed
- [x] app/api/research/route.ts:49-52 SIGNIFICANT — the bulk staleness reap in `GET /api/research`
  was restructured from a single atomic `updateMany` (staleness filter + `status: { notIn:
  TERMINAL_STATUSES }}` in one query) into a `findMany` (with the guard) followed by a separate
  `updateMany` keyed only on `id: { in: staleIds }` — the terminal-status guard was dropped from
  the write. This reopens a TOCTOU window: if a session in the returned `staleIds` set legitimately
  completes (e.g. `synthesizing` -> `done`, or any other status transition) in the gap between the
  `findMany` read and the `updateMany` write, the write matches it by id alone and overwrites its
  status back to `failed`/`timed_out` — clobbering a just-completed session's status (verdictJson
  and other data are untouched, but the session becomes inaccessible via its correct terminal
  state; a finished report reads as failed on both the list and, since `app/api/research/[id]/route.ts`
  only re-reaps non-terminal sessions, the detail page too). The single-session reap in
  `app/api/research/[id]/route.ts:49-52` does this correctly (guard stays on the write); only the
  list-route's bulk version lost it. Fix: add `status: { notIn: TERMINAL_STATUSES }` back to the
  `researchSession.updateMany`'s `where` at app/api/research/route.ts:50 (the `sourceAttempt`
  updateMany at line 57 is lower risk — it only ever touches `dispatched`/`discovered` rows — but
  is subject to the same race in principle and should probably move inside a single transaction
  with the session write, or be re-scoped the same way). — Fixed: the session updateMany now
  repeats the full staleness condition (`status: { notIn: TERMINAL_STATUSES }` + the same
  `updatedAt < staleCutoff` cutoff captured once before the findMany), and the sourceAttempt
  cleanup gained a `session: { status: "failed" }` relation filter so a session that escaped the
  reap by completing keeps its attempt rows untouched. Lint + build green.

### Adjudication — fixer's flagged concern (synthesize zero-findings guard)
The conditional `updateMany` in `app/api/research/[id]/synthesize/route.ts` (`where: { id:
sessionId, status: "synthesizing" }`) is correct/harmless defense-in-depth, not a hole. The route
already hard-gates on `session.status !== "synthesizing"` at the top (returning early otherwise),
and process-source's own guard (`status: { notIn: ["synthesizing", ...TERMINAL_STATUSES] }`) only
ever triggers one synthesize dispatch per session under normal operation. The only way this route
runs twice for the same session is a duplicate/retried dispatch of the internal POST — in that
case both invocations observe `status === "synthesizing"` and reach the zero-findings check, but
only the first `updateMany` matches (status still "synthesizing"); the second matches zero rows
and no-ops. The route doesn't branch on the updateMany's match count either way — it always
returns `{ ok: true, skipped: true }` — so a zero-row match is silently harmless. No new finding
here.

### Verification notes
- `bun run lint` — clean, no errors.
- `bunx tsc --noEmit` — clean, no errors.
- Per-fix verdict: 1 holds, 2 holds, 3 partially broken (list-route reap race above), 4 holds, 5
  holds.

## Round 3
### Findings (open)
(none)

Convergence check on the single fix that landed since Round 2 — the bulk staleness reap in
`GET /api/research` (app/api/research/route.ts:35-75) — and its blast radius. Traced the
completes-during-the-gap clobber race end to end with the repeated `status: { notIn:
TERMINAL_STATUSES }, updatedAt: { lt: staleCutoff } }` guard now on the session `updateMany`: a
session that transitions to a terminal status (or refreshes `updatedAt` via a resumed hop)
between the `findMany` and the `updateMany` no longer matches the write and is spared, matching
the single-session reap's existing pattern in `app/api/research/[id]/route.ts:49-52`. Confirmed
the genuinely-stuck path still reaps correctly: the session `updateMany` runs first and flips
matching rows to `failed`/`timed_out`, and only then does the `sourceAttempt.updateMany` run with
its `session: { status: "failed" }` relation filter — the ordering makes the filter satisfiable
(the session write has already committed by the time the attempt write's WHERE evaluates), not
self-defeating, and it correctly excludes any session that escaped the first write. Confirmed
`staleCutoff` is captured once (`const staleCutoff = new Date(Date.now() - STALE_SESSION_MS)`
before the `findMany`) and reused verbatim in the `updateMany`, so there's no drift between the
two timestamps. Confirmed the Prisma relation-filter syntax (`session: { status: "failed" }` on
`SourceAttempt.updateMany`) is valid against `prisma/schema.prisma:87-101` — `SourceAttempt` has a
`session` relation field (`session ResearchSession @relation(...)`), which is what a to-one
relation filter requires. Grepped every `researchSession.update`/`updateMany` call site
(app/api/research/route.ts, app/api/research/[id]/route.ts, .../process-source/route.ts,
.../synthesize/route.ts): the remaining unconditional `.update({ where: { id: sessionId } })`
calls are all single-session pipeline writes inside a session's own detached `continueSearch`/
process-source/synthesize execution flow (not a bulk multi-row reap), and the multi-row
`updateMany` calls elsewhere (`process-source/route.ts:258`, `:267`, `synthesize/route.ts:59`)
already carry a terminal-status or explicit-status guard in their `where`, per the Round 1
adjudication. No unguarded write site found. `bun run lint` and `bunx tsc --noEmit` both clean.

## Converged
3 rounds, 6 findings total (1 BLOCKER, 3 SIGNIFICANT, 2 MINOR), all fixed. No open findings
remain.
