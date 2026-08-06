import { afterAll, afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../src/app.ts';
import { prisma } from '../src/database/index.ts';
import { activity_action } from '../src/generated/prisma/client.ts';
import { ERROR_CODES } from '../src/shared/constants/error-codes.ts';
import { HttpStatus } from '../src/shared/constants/http-status.ts';
import { SYS_MSG } from '../src/shared/constants/system.messages.ts';
import { expectErrorResponse } from './helpers/assertions.ts';
import { resetDatabase } from './helpers/cleanup.ts';
import { isDatabaseAvailable } from './helpers/database.ts';
import { authenticateAs, createRequest, createReviewer } from './helpers/factories.ts';

// DB-backed suite: probe once and skip every case when the database is
// unreachable so the default `npm test` run never needs infrastructure
// (rule 16). Rollback, immutable history and the service-level concurrent 409
// are proven in transactions.integration.test.ts; this suite walks the state
// machine through the HTTP API and asserts the error matrix.
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

describe('workflow verification', () => {
  itDb('runs the full lifecycle: submit -> approve -> view with activity rows', async () => {
    const reviewer = await createReviewer();
    const id = (await createRequest()).id;

    const approveRes = await request(app)
      .post(`/api/requests/${id}/approve`)
      .set(authenticateAs(reviewer.id));
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
    const reviewer = await createReviewer();
    const id = (await createRequest()).id;

    const returnRes = await request(app)
      .post(`/api/requests/${id}/return`)
      .set(authenticateAs(reviewer.id))
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
      .set(authenticateAs(reviewer.id));
    expect(approveRes.status).toBe(HttpStatus.OK);
    expect(approveRes.body.data.status).toBe('APPROVED');
  });

  itDb('rejects an invalid transition with 400', async () => {
    const reviewer = await createReviewer();
    const id = (await createRequest()).id;

    await request(app).post(`/api/requests/${id}/approve`).set(authenticateAs(reviewer.id));

    const res = await request(app)
      .post(`/api/requests/${id}/approve`)
      .set(authenticateAs(reviewer.id));

    expectErrorResponse(res, {
      status: HttpStatus.BAD_REQUEST,
      code: ERROR_CODES.BAD_REQUEST,
      message: SYS_MSG.INVALID_STATE_TRANSITION,
    });
  });

  itDb('lets only one concurrent HTTP decision win; the loser gets 409', async () => {
    const reviewer = await createReviewer();
    const id = (await createRequest()).id;

    // Both requests read SUBMITTED before either transaction commits, so the
    // second guarded update matches no rows and surfaces as a duplicate
    // decision (409) instead of corrupting the request state.
    const [first, second] = await Promise.all([
      request(app).post(`/api/requests/${id}/approve`).set(authenticateAs(reviewer.id)),
      request(app).post(`/api/requests/${id}/approve`).set(authenticateAs(reviewer.id)),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([HttpStatus.OK, HttpStatus.CONFLICT]);
    const conflict = [first, second].find((res) => res.status === HttpStatus.CONFLICT);
    expect(conflict).toBeDefined();
    if (conflict) {
      expectErrorResponse(conflict, {
        status: HttpStatus.CONFLICT,
        code: ERROR_CODES.CONFLICT,
        message: SYS_MSG.DUPLICATE_DECISION,
      });
    }

    const final = await request(app).get(`/api/requests/${id}`);
    expect(final.body.data.status).toBe('APPROVED');
  });

  itDb('rejects decisions and comments without a bearer token with 401', async () => {
    const id = (await createRequest()).id;

    const approveRes = await request(app).post(`/api/requests/${id}/approve`);
    expectErrorResponse(approveRes, {
      status: HttpStatus.UNAUTHORIZED,
      code: ERROR_CODES.UNAUTHORIZED,
      message: SYS_MSG.INVALID_AUTHORIZATION_HEADER,
    });

    const commentRes = await request(app)
      .post(`/api/requests/${id}/comments`)
      .send({ body: 'Looks good' });
    expectErrorResponse(commentRes, {
      status: HttpStatus.UNAUTHORIZED,
      code: ERROR_CODES.UNAUTHORIZED,
      message: SYS_MSG.INVALID_AUTHORIZATION_HEADER,
    });
  });
});
