import { beforeEach, describe, expect, it, vi } from 'vitest';
import { request_status } from '../../../generated/prisma/client.ts';
import type { activity, comment, request } from '../../../generated/prisma/client.ts';
import { SYS_MSG } from '../../../shared/constants/system.messages.ts';
import { NotFoundError } from '../../../shared/errors/not-found-error.ts';
import { ValidationError } from '../../../shared/errors/validation-error.ts';
import { RequestService } from '../request.service.ts';

const mocks = vi.hoisted(() => ({
  prisma: { $transaction: vi.fn() },
  create: vi.fn(),
  findMany: vi.fn(),
  count: vi.fn(),
  findById: vi.fn(),
  recordSubmission: vi.fn(),
}));

vi.mock('../../../database/index.ts', () => ({ prisma: mocks.prisma }));
vi.mock('../request.repository.ts', () => ({
  create: mocks.create,
  findMany: mocks.findMany,
  count: mocks.count,
  findById: mocks.findById,
}));
vi.mock('../../activity/activity.service.ts', () => ({
  activityService: { recordSubmission: mocks.recordSubmission },
}));

type RequestRow = request & { comments: comment[]; activities: activity[] };

function makeRequestRow(overrides: Partial<RequestRow> = {}): RequestRow {
  return {
    id: 'req-1',
    title: 'New monitor',
    description: '4K display',
    department: 'Engineering',
    requester_name: 'Olu Smith',
    status: request_status.SUBMITTED,
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    updated_at: new Date('2026-01-01T00:00:00.000Z'),
    comments: [],
    activities: [],
    ...overrides,
  };
}

const tx = { id: 'transaction' };

describe('RequestService', () => {
  const service = new RequestService();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation((fn: (client: unknown) => Promise<unknown>) =>
      fn(tx),
    );
  });

  it('creates a request and records its SUBMISSION activity in one transaction', async () => {
    mocks.create.mockResolvedValue(makeRequestRow());
    mocks.recordSubmission.mockResolvedValue({});

    const result = await service.createRequest({
      title: 'New monitor',
      description: '4K display',
      department: 'Engineering',
      requesterName: 'Olu Smith',
    });

    expect(mocks.create).toHaveBeenCalledWith(tx, {
      title: 'New monitor',
      description: '4K display',
      department: 'Engineering',
      requester_name: 'Olu Smith',
    });
    expect(mocks.recordSubmission).toHaveBeenCalledWith(tx, 'req-1', 'Olu Smith');
    expect(result).toEqual({
      id: 'req-1',
      title: 'New monitor',
      description: '4K display',
      department: 'Engineering',
      requesterName: 'Olu Smith',
      status: request_status.SUBMITTED,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      comments: [],
      activities: [],
    });
  });

  it('throws ValidationError when the create payload is invalid', async () => {
    await expect(
      service.createRequest({ title: '', department: 'Engineering', requesterName: 'Olu Smith' }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('lists requests with pagination and camelCase items', async () => {
    mocks.findMany.mockResolvedValue([makeRequestRow()]);
    mocks.count.mockResolvedValue(7);

    const result = await service.listRequests({ page: 2, pageSize: 5 });

    expect(mocks.findMany).toHaveBeenCalledWith(mocks.prisma, {
      status: undefined,
      skip: 5,
      take: 5,
    });
    expect(mocks.count).toHaveBeenCalledWith(mocks.prisma, undefined);
    expect(result).toEqual({
      data: [
        expect.objectContaining({
          id: 'req-1',
          requesterName: 'Olu Smith',
          status: request_status.SUBMITTED,
        }),
      ],
      page: 2,
      pageSize: 5,
      total: 7,
      totalPages: 2,
    });
  });

  it('rejects an unknown status filter with ValidationError', async () => {
    await expect(
      service.listRequests({ status: 'ARCHIVED', page: 1, pageSize: 10 }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('returns a single request with its relations mapped to camelCase', async () => {
    const row = makeRequestRow({
      comments: [
        {
          id: 'c-1',
          request_id: 'req-1',
          reviewer_id: 'reviewer-1',
          body: 'Looks good',
          created_at: new Date('2026-01-02T00:00:00.000Z'),
        },
      ],
    });
    mocks.findById.mockResolvedValue(row);

    const result = await service.getRequestById('req-1');

    expect(mocks.findById).toHaveBeenCalledWith(mocks.prisma, 'req-1');
    expect(result.comments).toEqual([
      {
        id: 'c-1',
        requestId: 'req-1',
        reviewerId: 'reviewer-1',
        body: 'Looks good',
        createdAt: '2026-01-02T00:00:00.000Z',
      },
    ]);
    expect(result.activities).toEqual([]);
  });

  it('throws NotFoundError when the request does not exist', async () => {
    mocks.findById.mockResolvedValue(null);

    const promise = service.getRequestById('missing');

    await expect(promise).rejects.toBeInstanceOf(NotFoundError);
    await expect(promise).rejects.toMatchObject({
      message: SYS_MSG.REQUEST_NOT_FOUND,
      details: { request_id: 'missing' },
    });
  });
});
