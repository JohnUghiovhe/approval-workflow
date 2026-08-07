import { afterAll, afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../src/app.ts';
import { prisma } from '../src/database/index.ts';
import { ERROR_CODES } from '../src/shared/constants/error-codes.ts';
import { HttpStatus } from '../src/shared/constants/http-status.ts';
import { SYS_MSG } from '../src/shared/constants/system.messages.ts';
import { expectErrorResponse } from './helpers/assertions.ts';
import { resetDatabase } from './helpers/cleanup.ts';
import { isDatabaseAvailable } from './helpers/database.ts';
import { authenticateAs, createRequest, createReviewer } from './helpers/factories.ts';

// The wiring (404, 401, envelope) always runs; endpoint round-trips hit the
// database, so they skip when it is unreachable.
const dbAvailable = await isDatabaseAvailable();
const itDb = dbAvailable ? it : it.skip;

afterEach(async () => {
  if (dbAvailable) {
    await resetDatabase();
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

    expectErrorResponse(res, {
      status: HttpStatus.NOT_FOUND,
      code: ERROR_CODES.NOT_FOUND,
      message: SYS_MSG.RESOURCE_NOT_FOUND,
    });
    expect(res.body.errors).toEqual({ path: '/api/nope' });
  });

  it('rejects a decision without a bearer token with 401', async () => {
    const res = await request(app).post('/api/requests/some-id/approve');

    expectErrorResponse(res, {
      status: HttpStatus.UNAUTHORIZED,
      code: ERROR_CODES.UNAUTHORIZED,
      message: SYS_MSG.INVALID_AUTHORIZATION_HEADER,
    });
  });

  it('rejects a comment without a bearer token with 401', async () => {
    const res = await request(app)
      .post('/api/requests/some-id/comments')
      .send({ body: 'Looks good' });

    expectErrorResponse(res, {
      status: HttpStatus.UNAUTHORIZED,
      code: ERROR_CODES.UNAUTHORIZED,
      message: SYS_MSG.INVALID_AUTHORIZATION_HEADER,
    });
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

    const listRes = await request(app).get('/api/requests?page=1&pageSize=10');
    expect(listRes.status).toBe(HttpStatus.OK);
    expect(listRes.body.statusCode).toBe(HttpStatus.OK);
    expect(Array.isArray(listRes.body.data.data)).toBe(true);

    const viewRes = await request(app).get(`/api/requests/${id}`);
    expect(viewRes.status).toBe(HttpStatus.OK);
    expect(viewRes.body.data.id).toBe(id);
  });

  itDb('approves, returns, resubmits and rejects through /api', async () => {
    const reviewer = await createReviewer();

    const approveId = (await createRequest()).id;
    const approveRes = await request(app)
      .post(`/api/requests/${approveId}/approve`)
      .set(authenticateAs(reviewer.id));
    expect(approveRes.status).toBe(HttpStatus.OK);
    expect(approveRes.body.data.status).toBe('APPROVED');

    const returnId = (await createRequest()).id;
    const returnRes = await request(app)
      .post(`/api/requests/${returnId}/return`)
      .set(authenticateAs(reviewer.id))
      .send({ notes: 'Fix the details' });
    expect(returnRes.status).toBe(HttpStatus.OK);
    expect(returnRes.body.data.status).toBe('RETURNED');

    const resubmitRes = await request(app)
      .post(`/api/requests/${returnId}/resubmit`)
      .send({ requesterName: 'Olu Smith' });
    expect(resubmitRes.status).toBe(HttpStatus.OK);
    expect(resubmitRes.body.data.status).toBe('SUBMITTED');

    const rejectId = (await createRequest()).id;
    const rejectRes = await request(app)
      .post(`/api/requests/${rejectId}/reject`)
      .set(authenticateAs(reviewer.id))
      .send({ notes: 'Out of scope' });
    expect(rejectRes.status).toBe(HttpStatus.OK);
    expect(rejectRes.body.data.status).toBe('REJECTED');
  });

  itDb('accepts a comment through /api with reviewer auth', async () => {
    const reviewer = await createReviewer();
    const requestId = (await createRequest()).id;

    const res = await request(app)
      .post(`/api/requests/${requestId}/comments`)
      .set(authenticateAs(reviewer.id))
      .send({ body: 'Looks good' });

    expect(res.status).toBe(HttpStatus.CREATED);
    expect(res.body.statusCode).toBe(HttpStatus.CREATED);
    expect(res.body.message).toBe(SYS_MSG.COMMENT_ADDED);
    expect(res.body.data.body).toBe('Looks good');
    expect(res.body.data.reviewerName).toBeTruthy();
  });
});
