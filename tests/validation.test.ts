import { describe, expect, it } from 'vitest';
import request from 'supertest';
import express, { type Application, type Request, type Response } from 'express';
import { z } from 'zod';
import { ERROR_CODES } from '../src/shared/constants/error-codes.ts';
import { HttpStatus } from '../src/shared/constants/http-status.ts';
import { SYS_MSG } from '../src/shared/constants/system.messages.ts';
import { NotFoundError } from '../src/shared/errors/not-found-error.ts';
import { errorHandler } from '../src/shared/middleware/error-handler.ts';
import { validate } from '../src/shared/middleware/validate.ts';
import { catchAsync } from '../src/shared/utils/async-wrapper.ts';
import { sendSuccess } from '../src/shared/utils/response.ts';

const createRequestSchema = z.object({
  title: z.string().min(3),
  department: z.string().min(1),
});

const searchQuerySchema = z.object({
  q: z.string().min(1),
  page: z.coerce.number().int().min(1).default(1),
});

function buildTestApp(): Application {
  const app: Application = express();
  app.use(express.json());

  app.post('/requests', validate({ body: createRequestSchema }), (req: Request, res: Response) => {
    sendSuccess(res, { received: req.body });
  });

  app.get('/search', validate({ query: searchQuerySchema }), (req: Request, res: Response) => {
    sendSuccess(res, { received: req.query });
  });

  app.get(
    '/missing',
    catchAsync(async () => {
      throw new NotFoundError();
    }),
  );

  app.use(errorHandler);
  return app;
}

describe('validation layer', () => {
  const app = buildTestApp();

  it('rejects an invalid payload with 422 and formatted issues', async () => {
    const res = await request(app).post('/requests').send({ title: 'x', department: '' });

    expect(res.status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(res.body).toEqual({
      statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      message: SYS_MSG.VALIDATION_ERROR,
      code: ERROR_CODES.VALIDATION_ERROR,
      errors: [
        { field: 'title', message: 'Too small: expected string to have >=3 characters' },
        { field: 'department', message: 'Too small: expected string to have >=1 characters' },
      ],
    });
  });

  it('passes a valid payload through to the controller', async () => {
    const res = await request(app)
      .post('/requests')
      .send({ title: 'Laptop upgrade', department: 'Engineering' });

    expect(res.status).toBe(HttpStatus.OK);
    expect(res.body.data.received).toEqual({ title: 'Laptop upgrade', department: 'Engineering' });
  });

  it('writes normalized query values back onto the request', async () => {
    const res = await request(app).get('/search?q=monitor&page=2');

    expect(res.status).toBe(HttpStatus.OK);
    expect(res.body.data.received).toEqual({ q: 'monitor', page: 2 });
  });

  it('applies query defaults and coerces numeric query values', async () => {
    const res = await request(app).get('/search?q=monitor');

    expect(res.status).toBe(HttpStatus.OK);
    expect(res.body.data.received).toEqual({ q: 'monitor', page: 1 });
  });

  it('forwards rejected async handlers to the error middleware', async () => {
    const res = await request(app).get('/missing');

    expect(res.status).toBe(HttpStatus.NOT_FOUND);
    expect(res.body.message).toBe(SYS_MSG.RESOURCE_NOT_FOUND);
  });
});
