import express, { type Application } from 'express';
import request from 'supertest';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import app from '../src/app.ts';
import { prisma } from '../src/database/index.ts';
import { request_status } from '../src/generated/prisma/client.ts';
import { ERROR_CODES } from '../src/shared/constants/error-codes.ts';
import { HttpStatus } from '../src/shared/constants/http-status.ts';
import { SYS_MSG } from '../src/shared/constants/system.messages.ts';
import { errorHandler } from '../src/shared/middleware/error-handler.ts';
import { createRequestTimeout } from '../src/shared/middleware/timeout.ts';
import { expectErrorResponse } from './helpers/assertions.ts';
import { resetDatabase } from './helpers/cleanup.ts';
import { isDatabaseAvailable } from './helpers/database.ts';
import { authenticateAs, createRequest, createReviewer } from './helpers/factories.ts';

// Closes the HTTP-level gaps that the middleware unit tests only prove in
// isolation: the 422 envelope through the real routes, timeout behavior at
// the HTTP layer, security headers, pagination/filtering success paths, the
// empty list, and long-text round-tripping. DB-backed cases skip when the
// test database is unreachable.
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

describe('validation envelopes via HTTP', () => {
  it('rejects an invalid create body with 422', async () => {
    const res = await request(app).post('/api/requests').send({ title: '', department: '' });

    expectErrorResponse(res, {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      code: ERROR_CODES.VALIDATION_ERROR,
      message: SYS_MSG.VALIDATION_ERROR,
    });
    const errors = res.body.errors as Array<{ field: string; message: string }>;
    expect(Array.isArray(errors)).toBe(true);
    expect(errors.map((error) => error.field).sort()).toEqual([
      'department',
      'requesterName',
      'title',
    ]);
  });

  it('rejects an unknown status query filter with 422', async () => {
    const res = await request(app).get('/api/requests?status=bogus');

    expectErrorResponse(res, {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      code: ERROR_CODES.VALIDATION_ERROR,
      message: SYS_MSG.VALIDATION_ERROR,
    });
    expect(res.body.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'status' })]),
    );
  });

  it('rejects a malformed request id with 422', async () => {
    const res = await request(app).get('/api/requests/not-a-uuid');

    expectErrorResponse(res, {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      code: ERROR_CODES.VALIDATION_ERROR,
      message: SYS_MSG.VALIDATION_ERROR,
    });
    expect(res.body.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'id' })]),
    );
  });

  it('rejects malformed JSON with 400 BAD_REQUEST', async () => {
    const res = await request(app)
      .post('/api/requests')
      .set('Content-Type', 'application/json')
      .send('{not valid json');

    expectErrorResponse(res, {
      status: HttpStatus.BAD_REQUEST,
      code: ERROR_CODES.BAD_REQUEST,
      message: SYS_MSG.BAD_REQUEST,
    });
  });
});

describe('request timeout via HTTP', () => {
  // Short window so the tests finish quickly; the route under test must take
  // longer than 60ms to respond (or never respond at all).
  function buildApp(): Application {
    const testApp: Application = express();
    testApp.use(createRequestTimeout(60));
    testApp.get('/hang', () => {
      // Intentionally never responds; the timeout must answer with the 408.
    });
    testApp.get('/partial', (_req, res) => {
      // Writes headers and a first chunk, then stalls so the timeout can only
      // end the response instead of replacing it with the 408 envelope.
      res.status(HttpStatus.OK).write('partial');
    });
    testApp.use(errorHandler);
    return testApp;
  }

  const timeoutApp = buildApp();

  it('answers 408 with the standard envelope when headers were not sent', async () => {
    const res = await request(timeoutApp).get('/hang');

    expectErrorResponse(res, {
      status: HttpStatus.REQUEST_TIMEOUT,
      code: ERROR_CODES.REQUEST_TIMEOUT,
      message: SYS_MSG.REQUEST_TIMEOUT,
    });
  });

  it('ends a response whose headers were already sent when the timer fires', async () => {
    const res = await request(timeoutApp).get('/partial');

    expect(res.status).toBe(HttpStatus.OK);
    expect(res.text).toBe('partial');
  });
});

describe('security headers', () => {
  it('sends Helmet hardening headers and a permissive CORS header', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(HttpStatus.OK);
    expect(res.headers['access-control-allow-origin']).toBe('*');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['x-dns-prefetch-control']).toBe('off');
  });
});

describe('list behavior through /api', () => {
  itDb('returns an empty list with total 0 when no requests exist', async () => {
    const res = await request(app).get('/api/requests');

    expect(res.status).toBe(HttpStatus.OK);
    expect(res.body.data.data).toEqual([]);
    expect(res.body.data.total).toBe(0);
    expect(res.body.data.page).toBe(1);
    expect(res.body.data.pageSize).toBe(10);
  });

  itDb('paginates correctly and reports total and totalPages', async () => {
    // Sequential creation gives strictly increasing created_at values, so the
    // created_at desc ordering is deterministic across pages.
    const created = [];
    for (let index = 0; index < 6; index += 1) {
      created.push(await createRequest({ title: `Pagination request ${index}` }));
    }
    const ids = created.map((item) => item.id);

    const firstPage = await request(app).get('/api/requests?page=1&pageSize=2');
    expect(firstPage.status).toBe(HttpStatus.OK);
    expect(firstPage.body.data.page).toBe(1);
    expect(firstPage.body.data.pageSize).toBe(2);
    expect(firstPage.body.data.total).toBe(6);
    expect(firstPage.body.data.totalPages).toBe(3);
    expect(firstPage.body.data.data).toHaveLength(2);

    const lastPage = await request(app).get('/api/requests?page=3&pageSize=2');
    expect(lastPage.status).toBe(HttpStatus.OK);
    expect(lastPage.body.data.data).toHaveLength(2);

    const pageIds = [
      ...firstPage.body.data.data.map((row: { id: string }) => row.id),
      ...lastPage.body.data.data.map((row: { id: string }) => row.id),
    ];
    // Ordering is created_at desc, so adjacent pages must not overlap.
    expect(new Set(pageIds).size).toBe(4);
    expect(pageIds.every((id: string) => ids.includes(id))).toBe(true);
  });

  itDb('filters by status and returns only matching rows', async () => {
    const reviewer = await createReviewer();
    await Promise.all(
      Array.from({ length: 3 }, (_, index) =>
        createRequest({ title: `Filtered request ${index}` }),
      ),
    );

    const approvedOne = await createRequest({ title: 'Approved request 1' });
    const approvedTwo = await createRequest({ title: 'Approved request 2' });
    await request(app)
      .post(`/api/requests/${approvedOne.id}/approve`)
      .set(authenticateAs(reviewer.id));
    await request(app)
      .post(`/api/requests/${approvedTwo.id}/approve`)
      .set(authenticateAs(reviewer.id));

    const res = await request(app).get('/api/requests?status=APPROVED');

    expect(res.status).toBe(HttpStatus.OK);
    expect(res.body.data.total).toBe(2);
    expect(res.body.data.totalPages).toBe(1);
    expect(res.body.data.data).toHaveLength(2);
    expect(
      res.body.data.data.every((row: { status: string }) => row.status === request_status.APPROVED),
    ).toBe(true);
  });
});

describe('payload fidelity', () => {
  itDb('round-trips a long description with special characters', async () => {
    const special = 'café ☕ "double quotes" \'single\' & <b>tag</b> 100% €uros';
    const description = `${special}${'x'.repeat(10_000)}`;

    const createRes = await request(app).post('/api/requests').send({
      title: 'Payload fidelity',
      description,
      department: 'Engineering',
      requesterName: 'Olu Smith',
    });
    expect(createRes.status).toBe(HttpStatus.CREATED);
    expect(createRes.body.data.description).toBe(description);

    const viewRes = await request(app).get(`/api/requests/${createRes.body.data.id}`);
    expect(viewRes.status).toBe(HttpStatus.OK);
    expect(viewRes.body.data.description).toBe(description);
  });

  itDb('rejects an invalid decision body with 422', async () => {
    const reviewer = await createReviewer();
    const requestId = (await createRequest()).id;

    const res = await request(app)
      .post(`/api/requests/${requestId}/reject`)
      .set(authenticateAs(reviewer.id))
      .send({ notes: 123 });

    expectErrorResponse(res, {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      code: ERROR_CODES.VALIDATION_ERROR,
      message: SYS_MSG.VALIDATION_ERROR,
    });
    expect(res.body.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'notes' })]),
    );
  });
});
