import { beforeEach, describe, expect, it, vi } from 'vitest';
import { probeDatabase } from '../health.repository.ts';

const mocks = vi.hoisted(() => ({
  prisma: { $queryRaw: vi.fn() },
}));

vi.mock('../../../database/index.ts', () => ({ prisma: mocks.prisma }));

describe('probeDatabase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns true when the database responds to the probe', async () => {
    mocks.prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);

    await expect(probeDatabase()).resolves.toBe(true);
    expect(mocks.prisma.$queryRaw).toHaveBeenCalled();
  });

  it('returns false instead of throwing when the probe fails', async () => {
    mocks.prisma.$queryRaw.mockRejectedValue(new Error('connection refused'));

    await expect(probeDatabase()).resolves.toBe(false);
  });
});
