import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HealthService } from '../health.service.ts';
import { healthResponseSchema } from '../health.schema.ts';

const mocks = vi.hoisted(() => ({
  probeDatabase: vi.fn(),
}));

vi.mock('../health.repository.ts', () => ({ probeDatabase: mocks.probeDatabase }));

describe('HealthService', () => {
  const service = new HealthService();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports healthy with the database up', async () => {
    const result = await service.check(true);

    expect(result.status).toBe('healthy');
    expect(result.checks.database).toBe('up');
    expect(healthResponseSchema.safeParse(result).success).toBe(true);
  });

  it('reports degraded with the database down', async () => {
    const result = await service.check(false);

    expect(result.status).toBe('degraded');
    expect(result.checks.database).toBe('down');
  });

  it('includes uptime, version and a valid timestamp', async () => {
    const result = await service.check(true);

    expect(typeof result.timestamp).toBe('string');
    expect(Number.isNaN(Date.parse(result.timestamp))).toBe(false);
    expect(result.uptime).toBeGreaterThanOrEqual(0);
    expect(result.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('isDatabaseUp delegates to the repository probe', async () => {
    mocks.probeDatabase.mockResolvedValue(true);
    await expect(service.isDatabaseUp()).resolves.toBe(true);
    expect(mocks.probeDatabase).toHaveBeenCalledTimes(1);

    mocks.probeDatabase.mockResolvedValue(false);
    await expect(service.isDatabaseUp()).resolves.toBe(false);
  });
});
