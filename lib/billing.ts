import { prisma } from "@/lib/db";

// SITE-REDESIGN-PLAN.md §Stage C: billing + quota only. Free plan is capped at
// this many ResearchSessions per calendar month; Pro is unlimited.
// Raised 2026-07-15 from 3 to 10 (user request).
export const FREE_MONTHLY_REPORT_LIMIT = 10;

// Source cap per session — best-effort ceiling, not a guarantee (search may surface fewer
// unique candidates than the cap). Raised 2026-07-15 from a flat 12 to a tiered cap (user
// request). See app/api/research/route.ts for where this is applied.
export const FREE_SOURCE_CAP = 15;
export const PRO_SOURCE_CAP = 50;

export type Plan = "free" | "pro";

export function sourceCapForPlan(plan: Plan): number {
  return plan === "pro" ? PRO_SOURCE_CAP : FREE_SOURCE_CAP;
}

// No Subscription row means free. A row's status "active" is a real Stripe subscription;
// "comped" is a manually-granted pro account (Stripe billing is skipped for this deployment,
// see DEPLOY.md §h) — both count as pro. Anything else (canceled/past_due/etc.) falls back to
// free rather than locking the account out entirely.
export async function getPlanForUser(userId: string): Promise<Plan> {
  const subscription = await prisma.subscription.findUnique({
    where: { userId },
    select: { plan: true, status: true },
  });

  if (subscription?.plan === "pro" && (subscription.status === "active" || subscription.status === "comped")) {
    return "pro";
  }
  return "free";
}

export function startOfCurrentMonth(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

// Accepts an optional transaction client so the POST /api/research quota re-check (which must
// run inside the advisory-lock transaction to actually close the race, see S4) can reuse the
// exact same counting logic instead of drifting from this definition over time.
//
// excludeSessionId lets a re-check called after the current session row already exists (see
// continueSearch) omit that row from its own count — otherwise a session counts against its own
// limit and every free user tops out one report short of FREE_MONTHLY_REPORT_LIMIT (Round 1
// BLOCKER finding).
export async function countReportsThisMonth(
  userId: string,
  client: Pick<typeof prisma, "researchSession"> = prisma,
  excludeSessionId?: string
): Promise<number> {
  // Failed sessions (search provider down, no results, every source unfetchable, synthesis
  // error) produced nothing for the user — counting them against the monthly cap or returning
  // them as a "duplicate" would punish the user for an infrastructure failure, not their usage.
  return client.researchSession.count({
    where: {
      userId,
      createdAt: { gte: startOfCurrentMonth() },
      status: { not: "failed" },
      ...(excludeSessionId ? { id: { not: excludeSessionId } } : {}),
    },
  });
}

// Pricing FAQ promise: re-running the same query within 24h doesn't cost another slot —
// it just returns the existing session. Query match is case-insensitive/trimmed. Excludes
// failed sessions: without this, a failed query permanently bounces the user back to the same
// dead report for 24h with no way to actually retry (A2 finding).
export async function findRecentDuplicateSession(userId: string, query: string) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return prisma.researchSession.findFirst({
    where: {
      userId,
      createdAt: { gte: since },
      query: { equals: query.trim(), mode: "insensitive" },
      status: { not: "failed" },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
}
