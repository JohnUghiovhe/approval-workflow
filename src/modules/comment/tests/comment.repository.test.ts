import { beforeEach, describe, expect, it, vi } from 'vitest';
import { create, findByRequestId } from '../comment.repository.ts';
import type { DbClient } from '../comment.types.ts';

const client = {
  comment: { create: vi.fn(), findMany: vi.fn() },
} as unknown as DbClient;

describe('comment repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a comment and loads its reviewer', () => {
    create(client, {
      requestId: 'req-1',
      reviewerId: 'reviewer-1',
      body: 'Looks good',
    });

    expect(client.comment.create).toHaveBeenCalledWith({
      data: {
        request_id: 'req-1',
        reviewer_id: 'reviewer-1',
        body: 'Looks good',
      },
      include: { reviewer: true },
    });
  });

  it('lists comments for a request with the reviewer attached', () => {
    findByRequestId(client, 'req-1');

    expect(client.comment.findMany).toHaveBeenCalledWith({
      where: { request_id: 'req-1' },
      include: { reviewer: true },
      orderBy: { created_at: 'asc' },
    });
  });
});
