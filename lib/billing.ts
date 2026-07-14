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

function startOfCurrentMonth(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function countReportsThisMonth(userId: string): Promise<number> {
  return prisma.researchSession.count({
    where: { userId, createdAt: { gte: startOfCurrentMonth() } },
  });
}

// Pricing FAQ promise: re-running the same query within 24h doesn't cost another slot —
// it just returns the existing session. Query match is case-insensitive/trimmed.
export async function findRecentDuplicateSession(userId: string, query: string) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return prisma.researchSession.findFirst({
    where: {
      userId,
      createdAt: { gte: since },
      query: { equals: query.trim(), mode: "insensitive" },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
}
