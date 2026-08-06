import { prisma } from '../../database/index.ts';

// Probe the database with the lightest possible query. Never throws: a
// failure here must surface as a degraded health report, not a 5xx.
export async function probeDatabase(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
