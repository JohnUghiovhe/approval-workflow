import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import app from '../../../app.ts';
import { prisma } from '../../../database/index.ts';
import { HttpStatus } from '../../../shared/constants/http-status.ts';
import { SYS_MSG } from '../../../shared/constants/system.messages.ts';
import { healthResponseSchema, livenessResponseSchema } from '../health.schema.ts';
import { probeDatabase } from '../health.repository.ts';

// The healthy path probes the real database, so it must not fail (nor hang)
// when no database is reachable (rule 16). The degraded path is deterministic:
// the repository probe is mocked to report the database down, so it never
// touches infrastructure.
vi.mock('../health.repository.ts', async (importOriginal) => {
  const original = await importOriginal<typeof import('../health.repository.ts')>();
  return { probeDatabase: vi.fn(original.probeDatabase) };
});

async function databaseIsReachable(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

afterAll(async () => {
  if (await databaseIsReachable()) {
    await prisma.$disconnect();
  }
});

describe('health endpoints', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 200 with an app-only liveness report', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(HttpStatus.OK);
    expect(res.body.statusCode).toBe(HttpStatus.OK);
    expect(livenessResponseSchema.safeParse(res.body.data).success).toBe(true);
    expect(res.body.data.status).toBe('ok');
    expect(res.body.data.checks).toBeUndefined();
  });

  it('returns 200 for /health/ready when the database is reachable', async () => {
    vi.mocked(probeDatabase).mockResolvedValue(true);

    const res = await request(app).get('/health/ready');

    expect(res.status).toBe(HttpStatus.OK);
    expect(res.body.data.status).toBe('healthy');
    expect(res.body.data.checks.database).toBe('up');
  });

  it('returns 503 with a degraded report when the database is down', async () => {
    vi.mocked(probeDatabase).mockResolvedValue(false);

    const res = await request(app).get('/health/ready');

    expect(res.status).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    expect(res.body.statusCode).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    expect(res.body.message).toBe(SYS_MSG.OPERATION_SUCCESSFUL);
    expect(healthResponseSchema.safeParse(res.body.data).success).toBe(true);
    expect(res.body.data.status).toBe('degraded');
    expect(res.body.data.checks.database).toBe('down');
  });

  it('never leaks database details in a degraded readiness report', async () => {
    vi.mocked(probeDatabase).mockResolvedValue(false);

    const res = await request(app).get('/health/ready');

    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toMatch(/localhost|postgres|5432|5434|DATABASE_URL/i);
  });
});
