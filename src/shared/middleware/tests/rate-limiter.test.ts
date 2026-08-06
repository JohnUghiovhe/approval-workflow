import express, { type Application } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../constants/error-codes.ts';
import { HttpStatus } from '../../constants/http-status.ts';
import { SYS_MSG } from '../../constants/system.messages.ts';
import { createRateLimiter } from '../rate-limiter.ts';
import { errorHandler } from '../error-handler.ts';

function buildApp(): Application {
  const app: Application = express();
  app.use(createRateLimiter({ limit: 2, windowMs: 60_000 }));
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok' });
  });
  app.get('/ok', (_req, res) => {
    res.json({ ok: true });
  });
  app.use(errorHandler);
  return app;
}

describe('rateLimiter', () => {
  it('allows requests up to the configured limit', async () => {
    const app = buildApp();
    const first = await request(app).get('/ok');
    const second = await request(app).get('/ok');

    expect(first.status).toBe(HttpStatus.OK);
    expect(second.status).toBe(HttpStatus.OK);
  });

  it('responds 429 with the standard envelope once the limit is exceeded', async () => {
    const app = buildApp();
    await request(app).get('/ok');
    await request(app).get('/ok');
    const res = await request(app).get('/ok');

    expect(res.status).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(res.body).toEqual({
      statusCode: HttpStatus.TOO_MANY_REQUESTS,
      message: SYS_MSG.TOO_MANY_REQUESTS,
      code: ERROR_CODES.TOO_MANY_REQUESTS,
    });
  });

  it('never throttles the health endpoint', async () => {
    const app = buildApp();
    for (let i = 0; i < 5; i += 1) {
      const res = await request(app).get('/health');
      expect(res.status).toBe(HttpStatus.OK);
    }
  });

  it('throttles paths that merely prefix /health', async () => {
    const app = buildApp();
    await request(app).get('/ok');
    await request(app).get('/ok');
    const res = await request(app).get('/healthz');

    expect(res.status).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(res.body.code).toBe(ERROR_CODES.TOO_MANY_REQUESTS);
  });
});
