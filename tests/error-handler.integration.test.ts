import express, { type Application } from 'express';
import request from 'supertest';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/database/index.ts';
import { ERROR_CODES } from '../src/shared/constants/error-codes.ts';
import { HttpStatus } from '../src/shared/constants/http-status.ts';
import { SYS_MSG } from '../src/shared/constants/system.messages.ts';
import { errorHandler } from '../src/shared/middleware/error-handler.ts';
import { catchAsync } from '../src/shared/utils/async-wrapper.ts';
import { isDatabaseAvailable } from './helpers/database.ts';

// The error mapping runs without a database; this suite exercises the unique
// constraint path end to end, so it skips when the DB is unreachable.
const dbAvailable = await isDatabaseAvailable();
const itDb = dbAvailable ? it : it.skip;

const reviewerEmail = `dup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

function buildApp(): Application {
  const app: Application = express();
  // Intentionally lets the unique violation propagate to the error handler so
  // the Prisma -> 409 mapping is exercised against a real constraint.
  app.post(
    '/reviewers',
    catchAsync(async (_req, res) => {
      const reviewer = await prisma.reviewer.create({
        data: { name: 'Duplicate Test', email: reviewerEmail, role: 'reviewer' },
      });
      res.status(HttpStatus.CREATED).json({ id: reviewer.id });
    }),
  );
  app.use(errorHandler);
  return app;
}

describe('error handler (database-backed)', () => {
  const app = buildApp();

  afterEach(async () => {
    if (dbAvailable) {
      await prisma.reviewer.deleteMany({ where: { email: reviewerEmail } });
    }
  });

  afterAll(async () => {
    if (dbAvailable) {
      await prisma.$disconnect();
    }
  });

  itDb('maps a unique constraint violation to 409 CONFLICT without leaking details', async () => {
    const first = await request(app).post('/reviewers');
    expect(first.status).toBe(HttpStatus.CREATED);

    const duplicate = await request(app).post('/reviewers');
    expect(duplicate.status).toBe(HttpStatus.CONFLICT);
    expect(duplicate.body.code).toBe(ERROR_CODES.CONFLICT);
    expect(duplicate.body.message).toBe(SYS_MSG.CONFLICT);
    expect(duplicate.body.errors).toBeUndefined();
    expect(JSON.stringify(duplicate.body)).not.toContain('P2002');
    expect(JSON.stringify(duplicate.body)).not.toContain(reviewerEmail);
  });
});
