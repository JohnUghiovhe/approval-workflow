import { afterAll, afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../src/app.ts';
import { prisma } from '../src/database/index.ts';
import { HttpStatus } from '../src/shared/constants/http-status.ts';
import { SYS_MSG } from '../src/shared/constants/system.messages.ts';
import { isDatabaseAvailable } from './helpers/database.ts';

// The wiring (404, 401, envelope) always runs; endpoint round-trips hit the
// database, so they skip when it is unreachable (rule 16).
const dbAvailable = await isDatabaseAvailable();
const itDb = dbAvailable ? it : it.skip;

let reviewerId = '';
const requestIds: string[] = [];

async function createReviewer(): Promise<string> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const reviewer = await prisma.reviewer.create({
    data: {
      name: `API Test Reviewer ${suffix}`,
      email: `api-reviewer-${suffix}@example.com`,
      role: 'reviewer',
    },
  });
  return reviewer.id;
}

async function createRequest(): Promise<string> {
  const res = await request(app)
    .post('/api/requests')
    .send({
      title: `Wired monitor ${Date.now()}`,
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
  if (dbAvailable) {
    // Requests cascade to their comments and activities; only then can the
    // reviewer row (Restrict on comments) be removed safely.
    await prisma.request.deleteMany({ where: { id: { in: requestIds } } });
    requestIds.length = 0;
    if (reviewerId) {
      await prisma.reviewer.deleteMany({ where: { id: reviewerId } });
      reviewerId = '';
    }
  }
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.$disconnect();
  }
});

describe('REST API wiring', () => {
  it('returns a JSON 404 envelope for unknown routes under /api', async () => {
    const res = await request(app).get('/api/nope');

    expect(res.status).toBe(HttpStatus.NOT_FOUND);
    expect(res.body.statusCode).toBe(HttpStatus.NOT_FOUND);
    expect(res.body.message).toBe(SYS_MSG.RESOURCE_NOT_FOUND);
  });

  it('rejects a decision without a bearer token with 401', async () => {
    const res = await request(app).post('/api/requests/some-id/approve');

    expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
    expect(res.body.statusCode).toBe(HttpStatus.UNAUTHORIZED);
    expect(res.body.message).toBe(SYS_MSG.INVALID_AUTHORIZATION_HEADER);
  });

  it('rejects a comment without a bearer token with 401', async () => {
    const res = await request(app)
      .post('/api/requests/some-id/comments')
      .send({ body: 'Looks good' });

    expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
    expect(res.body.statusCode).toBe(HttpStatus.UNAUTHORIZED);
    expect(res.body.message).toBe(SYS_MSG.INVALID_AUTHORIZATION_HEADER);
  });

  itDb('creates, lists and views a request through /api with the envelope', async () => {
    const createRes = await request(app).post('/api/requests').send({
      title: 'Wired monitor',
      description: '4K display',
      department: 'Engineering',
      requesterName: 'Olu Smith',
    });

    expect(createRes.status).toBe(HttpStatus.CREATED);
    expect(createRes.body.statusCode).toBe(HttpStatus.CREATED);
    expect(createRes.body.data.requesterName).toBe('Olu Smith');
    const id = createRes.body.data.id as string;
    requestIds.push(id);

    const listRes = await request(app).get('/api/requests?page=1&pageSize=10');
    expect(listRes.status).toBe(HttpStatus.OK);
    expect(listRes.body.statusCode).toBe(HttpStatus.OK);
    expect(Array.isArray(listRes.body.data.data)).toBe(true);

    const viewRes = await request(app).get(`/api/requests/${id}`);
    expect(viewRes.status).toBe(HttpStatus.OK);
    expect(viewRes.body.data.id).toBe(id);
  });

  itDb('approves, returns, resubmits and rejects through /api', async () => {
    reviewerId = await createReviewer();

    const approveId = await createRequest();
    const approveRes = await request(app)
      .post(`/api/requests/${approveId}/approve`)
      .set('Authorization', `Bearer ${reviewerId}`);
    expect(approveRes.status).toBe(HttpStatus.OK);
    expect(approveRes.body.data.status).toBe('APPROVED');

    const returnId = await createRequest();
    const returnRes = await request(app)
      .post(`/api/requests/${returnId}/return`)
      .set('Authorization', `Bearer ${reviewerId}`)
      .send({ notes: 'Fix the details' });
    expect(returnRes.status).toBe(HttpStatus.OK);
    expect(returnRes.body.data.status).toBe('RETURNED');

    const resubmitRes = await request(app)
      .post(`/api/requests/${returnId}/resubmit`)
      .send({ requesterName: 'Olu Smith' });
    expect(resubmitRes.status).toBe(HttpStatus.OK);
    expect(resubmitRes.body.data.status).toBe('SUBMITTED');

    const rejectId = await createRequest();
    const rejectRes = await request(app)
      .post(`/api/requests/${rejectId}/reject`)
      .set('Authorization', `Bearer ${reviewerId}`)
      .send({ notes: 'Out of scope' });
    expect(rejectRes.status).toBe(HttpStatus.OK);
    expect(rejectRes.body.data.status).toBe('REJECTED');
  });

  itDb('accepts a comment through /api with reviewer auth', async () => {
    reviewerId = await createReviewer();
    const requestId = await createRequest();

    const res = await request(app)
      .post(`/api/requests/${requestId}/comments`)
      .set('Authorization', `Bearer ${reviewerId}`)
      .send({ body: 'Looks good' });

    expect(res.status).toBe(HttpStatus.CREATED);
    expect(res.body.statusCode).toBe(HttpStatus.CREATED);
    expect(res.body.message).toBe(SYS_MSG.COMMENT_ADDED);
    expect(res.body.data.body).toBe('Looks good');
    expect(res.body.data.reviewerName).toBeTruthy();
  });
});
