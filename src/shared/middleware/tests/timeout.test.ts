import express, { type Application } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../constants/error-codes.ts';
import { HttpStatus } from '../../constants/http-status.ts';
import { SYS_MSG } from '../../constants/system.messages.ts';
import { createRequestTimeout } from '../timeout.ts';
import { errorHandler } from '../error-handler.ts';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildApp(): Application {
  const app: Application = express();
  app.use(createRequestTimeout(60));
  app.get('/hang', () => {
    // Intentionally never responds; the timeout middleware must cut it off.
  });
  app.get('/health', async (_req, res) => {
    await delay(120);
    res.json({ status: 'ok' });
  });
  app.use(errorHandler);
  return app;
}

describe('requestTimeout', () => {
  const app = buildApp();

  it('responds 408 with the standard envelope when a request hangs', async () => {
    const res = await request(app).get('/hang');

    expect(res.status).toBe(HttpStatus.REQUEST_TIMEOUT);
    expect(res.body).toEqual({
      statusCode: HttpStatus.REQUEST_TIMEOUT,
      message: SYS_MSG.REQUEST_TIMEOUT,
      code: ERROR_CODES.REQUEST_TIMEOUT,
    });
  });

  it('never times out the health endpoint', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(HttpStatus.OK);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
