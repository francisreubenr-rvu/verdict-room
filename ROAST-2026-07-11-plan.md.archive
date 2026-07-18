# Roast Loop — PurchasePilot PLAN.md — 2026-07-11

Target: implementation plan document (no code exists yet). Round 0 (the 3-agent parallel
feasibility review) findings were already folded into the plan before this loop started:
agent-reach mismatch, taste-profile scope cut, async/deploy decision, SQLite-invalid schema,
unimplementable caching claim, auth/deploy contradiction, deferred cost decisions, dormant
DevPath precedent. All addressed in the current PLAN.md before Round 1 began.

## Round 1
### Findings (open)
(none — all fixed)

### Fixed
- [x] §4 schema — `Source` had a required `sessionId` FK + cascade delete AND a global `@unique`
  on `url`, which are mutually exclusive for a shared cache; also made `Finding.sessionId`
  required, so a cache hit still forced re-running the extract+classify LLM call (the dominant
  cost driver) — defeated the stated caching goal. Fixed: `Source` is now a global URL-unique
  cache with no `sessionId`; new `SessionSource` join table links sessions to sources
  many-to-many; `Finding` belongs to `Source` only. A cache hit now skips both the fetch and the
  LLM call. — was BLOCKER
- [x] §4 schema — `ResearchSession.queryHash` field + index declared as "for cache lookups" but
  never referenced by any pipeline step. Dropped entirely — the URL-level `Source` cache already
  does the real cost-saving work; a second cache layer wasn't earning its complexity. — was SIGNIFICANT
- [x] §3 step 4 (Synthesize) — free-text `Finding.option` values from independent per-source
  extraction calls were never explicitly reconciled into canonical `Option` rows. Now stated:
  the synthesis LLM call canonicalizes/dedupes option mentions as part of building the ranked list. — was MINOR
- [x] §3 step 2 (Fetch) — URL-level cache had no freshness bound. Added a 30-day window on
  `Source.updatedAt`; stale hits re-fetch and overwrite in place. — was MINOR
- [x] §6 M6 — hedged between loopback-only and LAN/public bind without deciding. Defaulted to
  loopback-only (matches the no-accounts posture), with widening noted as a later one-line
  config change. — was MINOR

## Round 2
### Findings (open)
(none — all fixed)

### Fixed
- [x] §2 said "up to 15 sources" while §3/§8 set the cap at 12 — stale figure left over from
  before the cap was tightened during Round 0's cost-decision fix. Now reads 12 everywhere. — MINOR
- [x] §3 step 5 ("Persist") described a batch write of session+sources+findings, but the Round 1
  fix made Source/Finding/Option persistence incremental (written during steps 2-4). Reworded to
  "Finalize" — mark the session done and write `verdictJson`, since that's the only work actually
  left at that point. — MINOR

## Round 3
Full re-read of PLAN.md end to end against: internal consistency (numbers, entity names,
cross-references), unstated assumptions, remaining scope smells, schema/architecture soundness,
and whether the milestone sequence delivers on §1's product promise. Zero new findings — plan is
internally consistent, every schema relation resolves, every cost/deploy/identity decision that
was previously deferred is now resolved in-place with a stated default, and the 6-milestone
sequence traces a straight line from a working single-query pipeline (M2-M4) to a shippable tool
(M5-M6) without smuggling back the personalization scope that was cut in Round 0.

## Converged
3 rounds, 10 findings (1 blocker, 1 significant, 8 minor — mostly Round 0 pre-work plus small
consistency slips introduced while fixing those), all fixed. No open findings remain.
