import { prisma } from '../../src/database/index.ts';

// Probe the configured database so DB-backed integration suites can skip when
// no database is reachable (tests must pass without a local .env or a running
// database).
export async function isDatabaseAvailable(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
