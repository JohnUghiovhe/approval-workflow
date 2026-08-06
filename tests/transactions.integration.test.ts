import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { activity_action, request_status } from '../src/generated/prisma/client.ts';
import { prisma } from '../src/database/index.ts';
import { ConflictError } from '../src/shared/errors/conflict-error.ts';
import { CommentService } from '../src/modules/comment/comment.service.ts';
import { DecisionService } from '../src/modules/decision/decision.service.ts';
import { RequestService } from '../src/modules/request/request.service.ts';
import { isDatabaseAvailable } from './helpers/database.ts';

// DB-backed suite: probe once and skip every case when the database is
// unreachable so the default `npm test` run never needs infrastructure.
const dbAvailable = await isDatabaseAvailable();
const itDb = dbAvailable ? it : it.skip;

const requestService = new RequestService();
const decisionService = new DecisionService();
const commentService = new CommentService();

let reviewerId = '';
const requestIds: string[] = [];

async function createReviewer(): Promise<string> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const reviewer = await prisma.reviewer.create({
    data: {
      name: `Test Reviewer ${suffix}`,
      email: `reviewer-${suffix}@example.com`,
      role: 'reviewer',
    },
  });
  return reviewer.id;
}

async function createRequest(): Promise<string> {
  const created = await requestService.createRequest({
    title: `Transaction ${Date.now()}`,
    description: '4K display',
    department: 'Engineering',
    requesterName: 'Olu Smith',
  });
  requestIds.push(created.id);
  return created.id;
}

beforeEach(async () => {
  reviewerId = await createReviewer();
});

afterEach(async () => {
  // Requests cascade to their comments and activities; only then can the
  // reviewer row (Restrict on comments) be removed safely.
  await prisma.request.deleteMany({ where: { id: { in: requestIds } } });
  requestIds.length = 0;
  await prisma.reviewer.deleteMany({ where: { id: reviewerId } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('transactional consistency', () => {
  itDb('rolls back every write when a transaction step fails', async () => {
    const title = `Doomed ${Date.now()}`;

    // Mirror the request + activity pattern; a forced failure after both
    // writes must leave no partial rows behind.
    await expect(
      prisma.$transaction(async (tx) => {
        const created = await tx.request.create({
          data: {
            title,
            description: 'Will be rolled back',
            department: 'Engineering',
            requester_name: 'Olu Smith',
          },
        });
        await tx.activity.create({
          data: {
            request_id: created.id,
            action: activity_action.SUBMISSION,
            to_status: request_status.SUBMITTED,
          },
        });
        throw new Error('forced failure');
      }),
    ).rejects.toThrow('forced failure');

    const requests = await prisma.request.count({ where: { title } });
    const activities = await prisma.activity.count({ where: { request: { title } } });
    expect(requests).toBe(0);
    expect(activities).toBe(0);
  });

  itDb('lets exactly one concurrent decision win and returns 409 to the other', async () => {
    const requestId = await createRequest();

    // Both callers read SUBMITTED before either writes, so the second guarded
    // update matches no rows and surfaces as a duplicate decision.
    const results = await Promise.allSettled([
      decisionService.decide(requestId, 'approve', reviewerId),
      decisionService.decide(requestId, 'approve', reviewerId),
    ]);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const failure = rejected[0];
    expect(failure).toBeDefined();
    if (failure?.status === 'rejected') {
      expect(failure.reason).toBeInstanceOf(ConflictError);
    }

    const final = await requestService.getRequestById(requestId);
    expect(final.status).toBe(request_status.APPROVED);
  });

  itDb('keeps the activity history append-only and stably ordered', async () => {
    const requestId = await createRequest();

    await decisionService.decide(requestId, 'approve', reviewerId, 'Looks good');
    await commentService.addComment(requestId, reviewerId, 'First comment');
    await commentService.addComment(requestId, reviewerId, 'Second comment');

    const history = await prisma.activity.findMany({
      where: { request_id: requestId },
      orderBy: { created_at: 'asc' },
    });

    expect(history).toHaveLength(4);
    expect(history.map((row) => row.action)).toEqual([
      activity_action.SUBMISSION,
      activity_action.APPROVAL,
      activity_action.COMMENT,
      activity_action.COMMENT,
    ]);

    // Repeated actions only ever add rows; earlier rows stay byte-identical.
    await commentService.addComment(requestId, reviewerId, 'Third comment');
    const after = await prisma.activity.findMany({
      where: { request_id: requestId },
      orderBy: { created_at: 'asc' },
    });

    expect(after).toHaveLength(5);
    expect(after.slice(0, 4)).toEqual(history);
  });
});
