import express, { type Application } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../shared/constants/error-codes.ts';
import { HttpStatus } from '../../shared/constants/http-status.ts';
import { errorHandler } from '../../shared/middleware/error-handler.ts';
import { envSchema } from '../env.ts';

// Only DATABASE_URL has no default; every other key falls back to a default,
// so providing the URL is enough to exercise the JSON_BODY_LIMIT rule.
const baseEnv = {
  DATABASE_URL: 'postgresql://test:test@localhost:5434/approval_workflow_test?schema=public',
};

function buildJsonApp(limit: string): Application {
  const app: Application = express();
  app.use(express.json({ limit }));
  app.post('/echo', (req, res) => {
    res.json(req.body);
  });
  app.use(errorHandler);
  return app;
}

describe('JSON_BODY_LIMIT configuration', () => {
  it('accepts a supported byte-size limit such as 100kb', () => {
    const result = envSchema.safeParse({ ...baseEnv, JSON_BODY_LIMIT: '100kb' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.JSON_BODY_LIMIT).toBe('100kb');
    }
  });

  it('rejects unsupported values such as unlimited at startup', () => {
    const result = envSchema.safeParse({ ...baseEnv, JSON_BODY_LIMIT: 'unlimited' });

    expect(result.success).toBe(false);
  });

  it('returns 413 for an oversized JSON body under a valid configured limit', async () => {
    const app = buildJsonApp('1kb');

    const res = await request(app)
      .post('/echo')
      .send({ data: 'x'.repeat(2048) });

    expect(res.status).toBe(HttpStatus.PAYLOAD_TOO_LARGE);
    expect(res.body.code).toBe(ERROR_CODES.PAYLOAD_TOO_LARGE);
  });
});
