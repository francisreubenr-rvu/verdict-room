import { prisma } from "@/lib/db";

// SITE-REDESIGN-PLAN.md §Stage C: billing + quota only. Free plan is capped at
// this many ResearchSessions per calendar month; Pro is unlimited.
export const FREE_MONTHLY_REPORT_LIMIT = 3;

export type Plan = "free" | "pro";

// No Subscription row, or a row whose status isn't active, means free — a
// canceled/past-due subscriber falls back to free rather than being locked
// out entirely.
export async function getPlanForUser(userId: string): Promise<Plan> {
  const subscription = await prisma.subscription.findUnique({
    where: { userId },
    select: { plan: true, status: true },
  });

  if (subscription?.plan === "pro" && subscription.status === "active") {
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
export async function countReportsThisMonth(
  userId: string,
  client: Pick<typeof prisma, "researchSession"> = prisma
): Promise<number> {
  // Failed sessions (search provider down, no results, every source unfetchable, synthesis
  // error) produced nothing for the user — counting them against the monthly cap or returning
  // them as a "duplicate" would punish the user for an infrastructure failure, not their usage.
  return client.researchSession.count({
    where: { userId, createdAt: { gte: startOfCurrentMonth() }, status: { not: "failed" } },
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
