import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { comment, reviewer } from '../../../generated/prisma/client.ts';
import { SYS_MSG } from '../../../shared/constants/system.messages.ts';
import { NotFoundError } from '../../../shared/errors/not-found-error.ts';
import { ValidationError } from '../../../shared/errors/validation-error.ts';
import { CommentService } from '../comment.service.ts';

const mocks = vi.hoisted(() => ({
  prisma: { $transaction: vi.fn() },
  create: vi.fn(),
  findById: vi.fn(),
  recordComment: vi.fn(),
}));

vi.mock('../../../database/index.ts', () => ({ prisma: mocks.prisma }));
vi.mock('../comment.repository.ts', () => ({ create: mocks.create }));
vi.mock('../../request/request.repository.ts', () => ({ findById: mocks.findById }));
vi.mock('../../activity/activity.service.ts', () => ({
  activityService: { recordComment: mocks.recordComment },
}));

type CommentRow = comment & { reviewer: reviewer };

function makeCommentRow(overrides: Partial<CommentRow> = {}): CommentRow {
  return {
    id: 'c-1',
    request_id: 'req-1',
    reviewer_id: 'reviewer-1',
    body: 'Looks good',
    created_at: new Date('2026-01-02T00:00:00.000Z'),
    reviewer: {
      id: 'reviewer-1',
      name: 'Jane Doe',
      email: 'jane@example.com',
      role: 'reviewer',
      is_active: true,
      created_at: new Date('2026-01-01T00:00:00.000Z'),
      updated_at: new Date('2026-01-01T00:00:00.000Z'),
    },
    ...overrides,
  };
}

const tx = { id: 'transaction' };

describe('CommentService', () => {
  const service = new CommentService();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation((fn: (client: unknown) => Promise<unknown>) =>
      fn(tx),
    );
    mocks.create.mockResolvedValue(makeCommentRow());
    mocks.recordComment.mockResolvedValue({});
  });

  it('creates a comment and records its COMMENT activity in one transaction', async () => {
    mocks.findById.mockResolvedValue({ id: 'req-1' });

    const result = await service.addComment('req-1', 'reviewer-1', 'Looks good');

    expect(mocks.findById).toHaveBeenCalledWith(tx, 'req-1');
    expect(mocks.create).toHaveBeenCalledWith(tx, {
      requestId: 'req-1',
      reviewerId: 'reviewer-1',
      body: 'Looks good',
    });
    expect(mocks.recordComment).toHaveBeenCalledWith(tx, 'req-1', 'reviewer-1', 'Looks good');
    expect(result).toEqual({
      id: 'c-1',
      requestId: 'req-1',
      reviewerId: 'reviewer-1',
      reviewerName: 'Jane Doe',
      body: 'Looks good',
      createdAt: '2026-01-02T00:00:00.000Z',
    });
  });

  it('throws NotFoundError when the request does not exist', async () => {
    mocks.findById.mockResolvedValue(null);

    const promise = service.addComment('missing', 'reviewer-1', 'Looks good');

    await expect(promise).rejects.toBeInstanceOf(NotFoundError);
    await expect(promise).rejects.toMatchObject({
      message: SYS_MSG.REQUEST_NOT_FOUND,
      details: { request_id: 'missing' },
    });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('throws ValidationError when the comment body is empty', async () => {
    const promise = service.addComment('req-1', 'reviewer-1', '');

    await expect(promise).rejects.toBeInstanceOf(ValidationError);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
