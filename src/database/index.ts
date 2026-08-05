import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.ts';
import { env } from '../config/env.ts';

// Prisma 7 requires a driver adapter instead of the old Rust query engine.
// The adapter is built once and reused by every client instance.
const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

// Reuse a single PrismaClient across hot reloads in dev to avoid exhausting
// the connection pool when tsx watch restarts the app.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
