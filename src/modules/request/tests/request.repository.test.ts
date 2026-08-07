import { beforeEach, describe, expect, it, vi } from 'vitest';
import { count, findMany } from '../request.repository.ts';
import type { DbClient } from '../request.types.ts';

const client = {
  request: { findMany: vi.fn(), count: vi.fn() },
} as unknown as DbClient;

describe('request repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists requests without a status filter', () => {
    findMany(client, { skip: 0, take: 10 });

    expect(client.request.findMany).toHaveBeenCalledWith({
      where: undefined,
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      skip: 0,
      take: 10,
    });
  });

  it('counts requests without a status filter', () => {
    count(client);

    expect(client.request.count).toHaveBeenCalledWith({ where: undefined });
  });
});
