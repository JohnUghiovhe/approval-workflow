import { beforeEach, describe, expect, it, vi } from 'vitest';
import { request_status } from '../../../generated/prisma/client.ts';
import type { activity, comment, request } from '../../../generated/prisma/client.ts';
import { SYS_MSG } from '../../../shared/constants/system.messages.ts';
import { BadRequestError } from '../../../shared/errors/bad-request-error.ts';
import { ConflictError } from '../../../shared/errors/conflict-error.ts';
import { NotFoundError } from '../../../shared/errors/not-found-error.ts';
import { DecisionService } from '../decision.service.ts';

const mocks = vi.hoisted(() => ({
  prisma: { $transaction: vi.fn() },
  findById: vi.fn(),
  updateStatusGuarded: vi.fn(),
  recordDecision: vi.fn(),
  recordResubmission: vi.fn(),
}));

vi.mock('../../../database/index.ts', () => ({ prisma: mocks.prisma }));
vi.mock('../decision.repository.ts', () => ({
  findById: mocks.findById,
  updateStatusGuarded: mocks.updateStatusGuarded,
}));
vi.mock('../../activity/activity.service.ts', () => ({
  activityService: {
    recordDecision: mocks.recordDecision,
    recordResubmission: mocks.recordResubmission,
  },
}));

type RequestRow = request & { comments: comment[]; activities: activity[] };

function makeRequestRow(status: request_status): RequestRow {
  return {
    id: 'req-1',
    title: 'New monitor',
    description: '4K display',
    department: 'Engineering',
    requester_name: 'Olu Smith',
    status,
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    updated_at: new Date('2026-01-01T00:00:00.000Z'),
    comments: [],
    activities: [],
  };
}

const tx = { id: 'transaction' };

describe('DecisionService', () => {
  const service = new DecisionService();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation((fn: (client: unknown) => Promise<unknown>) =>
      fn(tx),
    );
    mocks.updateStatusGuarded.mockResolvedValue(1);
    mocks.recordDecision.mockResolvedValue({});
    mocks.recordResubmission.mockResolvedValue({});
  });

  describe('validateTransition', () => {
    it.each([
      ['approve', true],
      ['reject', true],
      ['return', true],
    ] as const)('allows %s from SUBMITTED', (action, allowed) => {
      expect(service.validateTransition(request_status.SUBMITTED, action)).toBe(allowed);
    });

    it.each([['approve'], ['reject'], ['return']] as const)(
      'rejects %s from APPROVED, REJECTED and RETURNED',
      (action) => {
        const terminal = [
          request_status.APPROVED,
          request_status.REJECTED,
          request_status.RETURNED,
        ];
        for (const status of terminal) {
          expect(service.validateTransition(status, action)).toBe(false);
        }
      },
    );
  });

  it('approves a SUBMITTED request and records the activity in one transaction', async () => {
    mocks.findById
      .mockResolvedValueOnce(makeRequestRow(request_status.SUBMITTED))
      .mockResolvedValue(makeRequestRow(request_status.APPROVED));

    const result = await service.decide('req-1', 'approve', 'reviewer-1');

    expect(mocks.findById).toHaveBeenNthCalledWith(1, mocks.prisma, 'req-1');
    expect(mocks.updateStatusGuarded).toHaveBeenCalledWith(
      tx,
      'req-1',
      request_status.SUBMITTED,
      request_status.APPROVED,
    );
    expect(mocks.recordDecision).toHaveBeenCalledWith(
      tx,
      'req-1',
      'reviewer-1',
      'approve',
      request_status.SUBMITTED,
      request_status.APPROVED,
      undefined,
    );
    expect(mocks.findById).toHaveBeenNthCalledWith(2, tx, 'req-1');
    expect(result).toEqual({
      id: 'req-1',
      title: 'New monitor',
      description: '4K display',
      department: 'Engineering',
      requesterName: 'Olu Smith',
      status: request_status.APPROVED,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      comments: [],
      activities: [],
    });
  });

  it('rejects a SUBMITTED request with the decision notes', async () => {
    mocks.findById
      .mockResolvedValueOnce(makeRequestRow(request_status.SUBMITTED))
      .mockResolvedValue(makeRequestRow(request_status.REJECTED));

    const result = await service.decide('req-1', 'reject', 'reviewer-1', 'Missing details');

    expect(mocks.updateStatusGuarded).toHaveBeenCalledWith(
      tx,
      'req-1',
      request_status.SUBMITTED,
      request_status.REJECTED,
    );
    expect(mocks.recordDecision).toHaveBeenCalledWith(
      tx,
      'req-1',
      'reviewer-1',
      'reject',
      request_status.SUBMITTED,
      request_status.REJECTED,
      'Missing details',
    );
    expect(result.status).toBe(request_status.REJECTED);
  });

  it('returns a request to its requester', async () => {
    mocks.findById
      .mockResolvedValueOnce(makeRequestRow(request_status.SUBMITTED))
      .mockResolvedValue(makeRequestRow(request_status.RETURNED));

    const result = await service.decide('req-1', 'return', 'reviewer-1');

    expect(mocks.updateStatusGuarded).toHaveBeenCalledWith(
      tx,
      'req-1',
      request_status.SUBMITTED,
      request_status.RETURNED,
    );
    expect(result.status).toBe(request_status.RETURNED);
  });

  it('throws BadRequestError when the decision is not a valid transition', async () => {
    mocks.findById.mockResolvedValue(makeRequestRow(request_status.APPROVED));

    const promise = service.decide('req-1', 'approve', 'reviewer-1');

    await expect(promise).rejects.toBeInstanceOf(BadRequestError);
    await expect(promise).rejects.toMatchObject({
      message: SYS_MSG.INVALID_STATE_TRANSITION,
      details: {
        request_id: 'req-1',
        current_status: request_status.APPROVED,
        attempted_decision: 'approve',
      },
    });
    expect(mocks.updateStatusGuarded).not.toHaveBeenCalled();
  });

  it('throws ConflictError when the guarded update matches no rows', async () => {
    mocks.findById
      .mockResolvedValueOnce(makeRequestRow(request_status.SUBMITTED))
      .mockResolvedValue(makeRequestRow(request_status.APPROVED));
    mocks.updateStatusGuarded.mockResolvedValue(0);

    const promise = service.decide('req-1', 'approve', 'reviewer-1');

    await expect(promise).rejects.toBeInstanceOf(ConflictError);
    await expect(promise).rejects.toMatchObject({
      message: SYS_MSG.DUPLICATE_DECISION,
      details: { request_id: 'req-1', decision: 'approve' },
    });
    expect(mocks.recordDecision).not.toHaveBeenCalled();
  });

  it('throws NotFoundError when the request does not exist', async () => {
    mocks.findById.mockResolvedValue(null);

    const promise = service.decide('missing', 'approve', 'reviewer-1');

    await expect(promise).rejects.toBeInstanceOf(NotFoundError);
    await expect(promise).rejects.toMatchObject({
      message: SYS_MSG.REQUEST_NOT_FOUND,
      details: { request_id: 'missing' },
    });
  });

  it('resubmits a RETURNED request and records the RESUBMISSION activity', async () => {
    mocks.findById
      .mockResolvedValueOnce(makeRequestRow(request_status.RETURNED))
      .mockResolvedValue(makeRequestRow(request_status.SUBMITTED));

    const result = await service.resubmit('req-1', 'Olu Smith');

    expect(mocks.updateStatusGuarded).toHaveBeenCalledWith(
      tx,
      'req-1',
      request_status.RETURNED,
      request_status.SUBMITTED,
    );
    expect(mocks.recordResubmission).toHaveBeenCalledWith(tx, 'req-1', 'Olu Smith');
    expect(result.status).toBe(request_status.SUBMITTED);
  });

  it('throws BadRequestError when resubmitting a non-RETURNED request', async () => {
    mocks.findById.mockResolvedValue(makeRequestRow(request_status.SUBMITTED));

    const promise = service.resubmit('req-1', 'Olu Smith');

    await expect(promise).rejects.toBeInstanceOf(BadRequestError);
    await expect(promise).rejects.toMatchObject({
      message: SYS_MSG.INVALID_STATE_TRANSITION,
      details: {
        request_id: 'req-1',
        current_status: request_status.SUBMITTED,
        attempted_decision: 'resubmit',
      },
    });
  });
});
