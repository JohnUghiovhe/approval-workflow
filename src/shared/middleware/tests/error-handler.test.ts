import express, { type Application } from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '../../../generated/prisma/client.ts';
import { ERROR_CODES } from '../../constants/error-codes.ts';
import { HttpStatus } from '../../constants/http-status.ts';
import { SYS_MSG } from '../../constants/system.messages.ts';
import { BadRequestError } from '../../errors/bad-request-error.ts';
import { ConflictError } from '../../errors/conflict-error.ts';
import { NotFoundError } from '../../errors/not-found-error.ts';
import { ValidationError } from '../../errors/validation-error.ts';
import { errorHandler } from '../error-handler.ts';
import { logger } from '../../utils/logger.ts';

function prismaError(code: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(`prisma error ${code}`, {
    code,
    clientVersion: '7.0.0',
  });
}

function buildApp(): Application {
  const app: Application = express();
  app.get('/boom', () => {
    throw new Error('secret internal detail');
  });
  app.get('/bad', () => {
    throw new BadRequestError();
  });
  app.get('/not-found', () => {
    throw new NotFoundError();
  });
  app.get('/conflict', () => {
    throw new ConflictError(SYS_MSG.DUPLICATE_DECISION, {
      request_id: 'req-123',
      decision: 'approve',
    });
  });
  app.get('/validation', () => {
    throw new ValidationError(SYS_MSG.VALIDATION_ERROR, [{ field: 'title', message: 'Too small' }]);
  });
  app.get('/prisma-unique', () => {
    throw prismaError('P2002');
  });
  app.get('/prisma-missing', () => {
    throw prismaError('P2025');
  });
  app.get('/prisma-fk', () => {
    throw prismaError('P2003');
  });
  app.get('/prisma-other', () => {
    throw prismaError('P2024');
  });
  app.use(errorHandler);
  return app;
}

describe('errorHandler', () => {
  const app = buildApp();

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a generic 500 for an unhandled error without leaking details', async () => {
    const res = await request(app).get('/boom');

    expect(res.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(res.body).toEqual({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: SYS_MSG.INTERNAL_SERVER_ERROR,
      code: ERROR_CODES.INTERNAL,
    });
  });

  it('logs 500s at error level with the original error', async () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined as never);

    await request(app).get('/boom');

    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.any(Error),
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      }),
      SYS_MSG.INTERNAL_SERVER_ERROR,
    );
  });

  it('logs 4xx at warn level', async () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined as never);
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined as never);

    await request(app).get('/bad');

    expect(warnSpy).toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('maps BadRequestError to 400 BAD_REQUEST', async () => {
    const res = await request(app).get('/bad');

    expect(res.status).toBe(HttpStatus.BAD_REQUEST);
    expect(res.body.code).toBe(ERROR_CODES.BAD_REQUEST);
  });

  it('maps NotFoundError to 404 NOT_FOUND', async () => {
    const res = await request(app).get('/not-found');

    expect(res.status).toBe(HttpStatus.NOT_FOUND);
    expect(res.body.code).toBe(ERROR_CODES.NOT_FOUND);
  });

  it('maps ConflictError to 409 CONFLICT and keeps details in errors', async () => {
    const res = await request(app).get('/conflict');

    expect(res.status).toBe(HttpStatus.CONFLICT);
    expect(res.body.code).toBe(ERROR_CODES.CONFLICT);
    expect(res.body.message).toBe(SYS_MSG.DUPLICATE_DECISION);
    expect(res.body.errors).toEqual({ request_id: 'req-123', decision: 'approve' });
  });

  it('maps ValidationError to 422 VALIDATION_ERROR with the issue list', async () => {
    const res = await request(app).get('/validation');

    expect(res.status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(res.body.code).toBe(ERROR_CODES.VALIDATION_ERROR);
    expect(res.body.errors).toEqual([{ field: 'title', message: 'Too small' }]);
  });

  it('maps P2002 to 409 CONFLICT', async () => {
    const res = await request(app).get('/prisma-unique');

    expect(res.status).toBe(HttpStatus.CONFLICT);
    expect(res.body.code).toBe(ERROR_CODES.CONFLICT);
  });

  it('maps P2025 to 404 NOT_FOUND', async () => {
    const res = await request(app).get('/prisma-missing');

    expect(res.status).toBe(HttpStatus.NOT_FOUND);
    expect(res.body.code).toBe(ERROR_CODES.NOT_FOUND);
  });

  it('maps P2003 to 422 VALIDATION_ERROR', async () => {
    const res = await request(app).get('/prisma-fk');

    expect(res.status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(res.body.code).toBe(ERROR_CODES.VALIDATION_ERROR);
  });

  it('maps unmapped Prisma errors to a generic 500 without leaking the raw message', async () => {
    const res = await request(app).get('/prisma-other');

    expect(res.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(res.body).toEqual({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: SYS_MSG.INTERNAL_SERVER_ERROR,
      code: ERROR_CODES.DB_ERROR,
    });
  });
});
