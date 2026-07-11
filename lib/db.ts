import { PrismaClient } from "@prisma/client";

// Standard Next.js singleton pattern: avoid exhausting the Postgres connection
// pool by re-instantiating PrismaClient on every hot reload in dev.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
