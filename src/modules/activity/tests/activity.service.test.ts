import { beforeEach, describe, expect, it, vi } from 'vitest';
import { activity_action, request_status } from '../../../generated/prisma/client.ts';
import type { activity } from '../../../generated/prisma/client.ts';
import { SYS_MSG } from '../../../shared/constants/system.messages.ts';
import { NotFoundError } from '../../../shared/errors/not-found-error.ts';
import { activityService } from '../activity.service.ts';
import type { DbClient } from '../activity.types.ts';

const mocks = vi.hoisted(() => ({
  prisma: { request: { findUnique: vi.fn() }, activity: { findMany: vi.fn() } },
  findRequestById: vi.fn(),
  create: vi.fn(),
  listByRequestId: vi.fn(),
}));

vi.mock('../../../database/index.ts', () => ({ prisma: mocks.prisma }));
vi.mock('../../request/request.repository.ts', () => ({ findById: mocks.findRequestById }));
vi.mock('../activity.repository.ts', () => ({
  create: mocks.create,
  listByRequestId: mocks.listByRequestId,
}));

const client = {} as DbClient;

describe('activityService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.create.mockResolvedValue({ id: 'act-1' } as unknown as activity);
    mocks.listByRequestId.mockResolvedValue([]);
  });

  it('records a SUBMISSION with the requester name in the note', async () => {
    await activityService.recordSubmission(client, 'req-1', 'Olu Smith');

    expect(mocks.create).toHaveBeenCalledWith(client, {
      request_id: 'req-1',
      action: activity_action.SUBMISSION,
      to_status: request_status.SUBMITTED,
      note: 'Olu Smith',
    });
  });

  it.each([
    ['approve', activity_action.APPROVAL],
    ['reject', activity_action.REJECTION],
    ['return', activity_action.RETURN],
  ] as const)('maps the %s decision to its activity action', async (action, expectedAction) => {
    await activityService.recordDecision(
      client,
      'req-1',
      'reviewer-1',
      action,
      request_status.SUBMITTED,
      request_status.APPROVED,
      'Looks good',
    );

    expect(mocks.create).toHaveBeenCalledWith(client, {
      request_id: 'req-1',
      reviewer_id: 'reviewer-1',
      action: expectedAction,
      from_status: request_status.SUBMITTED,
      to_status: request_status.APPROVED,
      note: 'Looks good',
    });
  });

  it('records a RESUBMISSION with the RETURNED to SUBMITTED transition', async () => {
    await activityService.recordResubmission(client, 'req-1', 'Olu Smith');

    expect(mocks.create).toHaveBeenCalledWith(client, {
      request_id: 'req-1',
      action: activity_action.RESUBMISSION,
      from_status: request_status.RETURNED,
      to_status: request_status.SUBMITTED,
      note: 'Olu Smith',
    });
  });

  it('records a COMMENT with the body as the note', async () => {
    await activityService.recordComment(client, 'req-1', 'reviewer-1', 'Looks good');

    expect(mocks.create).toHaveBeenCalledWith(client, {
      request_id: 'req-1',
      reviewer_id: 'reviewer-1',
      action: activity_action.COMMENT,
      note: 'Looks good',
    });
  });

  it('lists activities for a request ordered by creation', async () => {
    await activityService.listByRequestId(client, 'req-1');

    expect(mocks.listByRequestId).toHaveBeenCalledWith(client, 'req-1');
  });

  it('returns the activity history as camelCase DTOs for an existing request', async () => {
    mocks.findRequestById.mockResolvedValue({ id: 'req-1' });
    mocks.listByRequestId.mockResolvedValue([
      {
        id: 'act-1',
        request_id: 'req-1',
        reviewer_id: 'reviewer-1',
        action: activity_action.SUBMISSION,
        from_status: null,
        to_status: request_status.SUBMITTED,
        note: 'Olu Smith',
        created_at: new Date('2026-01-01T00:00:00.000Z'),
      },
    ] as activity[]);

    const result = await activityService.getActivitiesByRequestId('req-1');

    expect(mocks.findRequestById).toHaveBeenCalledWith(mocks.prisma, 'req-1');
    expect(mocks.listByRequestId).toHaveBeenCalledWith(mocks.prisma, 'req-1');
    expect(result).toEqual([
      {
        id: 'act-1',
        requestId: 'req-1',
        reviewerId: 'reviewer-1',
        action: activity_action.SUBMISSION,
        fromStatus: null,
        toStatus: request_status.SUBMITTED,
        note: 'Olu Smith',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
  });

  it('throws NotFoundError when the request has no activities endpoint target', async () => {
    mocks.findRequestById.mockResolvedValue(null);

    const promise = activityService.getActivitiesByRequestId('missing');

    await expect(promise).rejects.toBeInstanceOf(NotFoundError);
    await expect(promise).rejects.toMatchObject({
      message: SYS_MSG.REQUEST_NOT_FOUND,
      details: { request_id: 'missing' },
    });
    expect(mocks.listByRequestId).not.toHaveBeenCalled();
  });
});
