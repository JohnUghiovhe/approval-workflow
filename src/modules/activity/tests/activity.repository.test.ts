import { beforeEach, describe, expect, it, vi } from 'vitest';
import { create, createMany, listByRequestId } from '../activity.repository.ts';
import type { DbClient } from '../activity.types.ts';

const client = {
  activity: { create: vi.fn(), createMany: vi.fn(), findMany: vi.fn() },
} as unknown as DbClient;

describe('activity repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a single activity row', () => {
    const data = { request_id: 'req-1', action: 'SUBMISSION', to_status: 'SUBMITTED' };

    create(client, data as never);

    expect(client.activity.create).toHaveBeenCalledWith({ data });
  });

  it('bulk creates activity rows for the seed', () => {
    const rows = [{ request_id: 'req-1', action: 'SUBMISSION', to_status: 'SUBMITTED' }];

    createMany(client, rows as never);

    expect(client.activity.createMany).toHaveBeenCalledWith({ data: rows });
  });

  it('lists activity for a request ordered by creation', () => {
    listByRequestId(client, 'req-1');

    expect(client.activity.findMany).toHaveBeenCalledWith({
      where: { request_id: 'req-1' },
      orderBy: { created_at: 'asc' },
    });
  });
});
