import { afterAll, afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../src/app.ts';
import { prisma } from '../src/database/index.ts';
import { activity_action } from '../src/generated/prisma/client.ts';
import { HttpStatus } from '../src/shared/constants/http-status.ts';
import { SYS_MSG } from '../src/shared/constants/system.messages.ts';
import { isDatabaseAvailable } from './helpers/database.ts';

// DB-backed suite: probe once and skip every case when the database is
// unreachable so the default `npm test` run never needs infrastructure
// (rule 16). Rollback, immutable history and the service-level concurrent 409
// are proven in transactions.integration.test.ts; this suite walks the state
// machine through the HTTP API and asserts the error matrix.
const dbAvailable = await isDatabaseAvailable();
const itDb = dbAvailable ? it : it.skip;

let reviewerId = '';
const requestIds: string[] = [];

async function createReviewer(): Promise<string> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const reviewer = await prisma.reviewer.create({
    data: {
      name: `Workflow Test Reviewer ${suffix}`,
      email: `workflow-reviewer-${suffix}@example.com`,
      role: 'reviewer',
    },
  });
  return reviewer.id;
}

async function createRequest(): Promise<string> {
  const res = await request(app)
    .post('/api/requests')
    .send({
      title: `Workflow request ${Date.now()}`,
      description: '4K display',
      department: 'Engineering',
      requesterName: 'Olu Smith',
    });
  expect(res.status).toBe(HttpStatus.CREATED);
  const id = res.body.data.id as string;
  requestIds.push(id);
  return id;
}

afterEach(async () => {
  // Requests cascade to their comments and activities; only then can the
  // reviewer row (Restrict on comments) be removed safely.
  await prisma.request.deleteMany({ where: { id: { in: requestIds } } });
  requestIds.length = 0;
  if (reviewerId) {
    await prisma.reviewer.deleteMany({ where: { id: reviewerId } });
    reviewerId = '';
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('workflow verification', () => {
  itDb('runs the full lifecycle: submit -> approve -> view with activity rows', async () => {
    reviewerId = await createReviewer();
    const id = await createRequest();

    const approveRes = await request(app)
      .post(`/api/requests/${id}/approve`)
      .set('Authorization', `Bearer ${reviewerId}`);
    expect(approveRes.status).toBe(HttpStatus.OK);
    expect(approveRes.body.data.status).toBe('APPROVED');

    const viewRes = await request(app).get(`/api/requests/${id}`);
    expect(viewRes.status).toBe(HttpStatus.OK);
    expect(viewRes.body.data.status).toBe('APPROVED');
    expect(viewRes.body.data.activities.map((row: { action: string }) => row.action)).toEqual([
      activity_action.SUBMISSION,
      activity_action.APPROVAL,
    ]);
  });

  itDb('runs submit -> return -> resubmit -> approve', async () => {
    reviewerId = await createReviewer();
    const id = await createRequest();

    const returnRes = await request(app)
      .post(`/api/requests/${id}/return`)
      .set('Authorization', `Bearer ${reviewerId}`)
      .send({ notes: 'Fix the details' });
    expect(returnRes.status).toBe(HttpStatus.OK);
    expect(returnRes.body.data.status).toBe('RETURNED');

    const resubmitRes = await request(app)
      .post(`/api/requests/${id}/resubmit`)
      .send({ requesterName: 'Olu Smith' });
    expect(resubmitRes.status).toBe(HttpStatus.OK);
    expect(resubmitRes.body.data.status).toBe('SUBMITTED');

    const approveRes = await request(app)
      .post(`/api/requests/${id}/approve`)
      .set('Authorization', `Bearer ${reviewerId}`);
    expect(approveRes.status).toBe(HttpStatus.OK);
    expect(approveRes.body.data.status).toBe('APPROVED');
  });

  itDb('rejects an invalid transition with 400', async () => {
    reviewerId = await createReviewer();
    const id = await createRequest();

    await request(app)
      .post(`/api/requests/${id}/approve`)
      .set('Authorization', `Bearer ${reviewerId}`);

    const res = await request(app)
      .post(`/api/requests/${id}/approve`)
      .set('Authorization', `Bearer ${reviewerId}`);

    expect(res.status).toBe(HttpStatus.BAD_REQUEST);
    expect(res.body.message).toBe(SYS_MSG.INVALID_STATE_TRANSITION);
  });

  itDb('lets only one concurrent HTTP decision win; the loser gets 409', async () => {
    reviewerId = await createReviewer();
    const id = await createRequest();

    // Both requests read SUBMITTED before either transaction commits, so the
    // second guarded update matches no rows and surfaces as a duplicate
    // decision (409) instead of corrupting the request state.
    const [first, second] = await Promise.all([
      request(app).post(`/api/requests/${id}/approve`).set('Authorization', `Bearer ${reviewerId}`),
      request(app).post(`/api/requests/${id}/approve`).set('Authorization', `Bearer ${reviewerId}`),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([HttpStatus.OK, HttpStatus.CONFLICT]);
    const conflict = [first, second].find((res) => res.status === HttpStatus.CONFLICT);
    expect(conflict?.body.message).toBe(SYS_MSG.DUPLICATE_DECISION);

    const final = await request(app).get(`/api/requests/${id}`);
    expect(final.body.data.status).toBe('APPROVED');
  });

  itDb('rejects decisions and comments without a bearer token with 401', async () => {
    const id = await createRequest();

    const approveRes = await request(app).post(`/api/requests/${id}/approve`);
    expect(approveRes.status).toBe(HttpStatus.UNAUTHORIZED);
    expect(approveRes.body.message).toBe(SYS_MSG.INVALID_AUTHORIZATION_HEADER);

    const commentRes = await request(app)
      .post(`/api/requests/${id}/comments`)
      .send({ body: 'Looks good' });
    expect(commentRes.status).toBe(HttpStatus.UNAUTHORIZED);
    expect(commentRes.body.message).toBe(SYS_MSG.INVALID_AUTHORIZATION_HEADER);
  });
});
