import type { ErrorRequestHandler } from 'express';
import { Prisma } from '../../generated/prisma/client.ts';
import { ERROR_CODES } from '../constants/error-codes.ts';
import { HttpStatus } from '../constants/http-status.ts';
import { SYS_MSG } from '../constants/system.messages.ts';
import { AppError } from '../errors/app-error.ts';
import { BadRequestError } from '../errors/bad-request-error.ts';
import { ConflictError } from '../errors/conflict-error.ts';
import { NotFoundError } from '../errors/not-found-error.ts';
import { ValidationError } from '../errors/validation-error.ts';
import type { ApiErrorResponse } from '../types/api-response.ts';
import { logger } from '../utils/logger.ts';

// Derive the failing resource id from the matched route so logs and responses
// can be correlated with the request row that failed.
function getRequestId(req: Parameters<ErrorRequestHandler>[1]): string | undefined {
  const paramId = req.params.id;
  return typeof paramId === 'string' && paramId.length > 0 ? paramId : undefined;
}

// Derive the request correlation id set by the pino-http middleware (genReqId)
// so error lines can be traced alongside the access log for the same request.
function getCorrelationId(req: Parameters<ErrorRequestHandler>[1]): string | undefined {
  const id = req.id;
  return typeof id === 'string' && id.length > 0 ? id : undefined;
}

// Express's JSON body parser rejects malformed bodies with a SyntaxError
// flagged with a 4xx status (type entity.parse.failed). Map those to 400 so a
// client mistake is not reported as a 500 server failure.
function isBodyParserError(err: unknown): err is SyntaxError & { status: number } {
  const status = (err as { status?: unknown } | null)?.status;
  return err instanceof SyntaxError && typeof status === 'number' && status >= 400 && status < 500;
}

// Map Prisma constraint errors onto the typed error hierarchy so database
// failures surface through the same envelope as business errors. Known
// violations become client-facing 4xx; anything else stays an internal 500 and
// the original error is logged by the handler.
function normalizeError(err: unknown): AppError {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002':
        return new ConflictError(SYS_MSG.CONFLICT);
      case 'P2025':
        return new NotFoundError(SYS_MSG.RESOURCE_NOT_FOUND);
      case 'P2003':
        return new ValidationError(SYS_MSG.VALIDATION_ERROR);
      default:
        return new AppError(
          HttpStatus.INTERNAL_SERVER_ERROR,
          SYS_MSG.INTERNAL_SERVER_ERROR,
          undefined,
          ERROR_CODES.DB_ERROR,
        );
    }
  }
  if (err instanceof AppError) {
    return err;
  }
  if (isBodyParserError(err)) {
    return new BadRequestError(SYS_MSG.BAD_REQUEST);
  }
  return new AppError(HttpStatus.INTERNAL_SERVER_ERROR, SYS_MSG.INTERNAL_SERVER_ERROR);
}

// Central error middleware. Anything not an AppError or a known Prisma error
// becomes a generic 500 so internal details never leak to clients.
export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  const normalized = normalizeError(err);
  const statusCode = normalized.statusCode;
  const message = normalized.message;
  const requestId = getRequestId(req);
  const correlationId = getCorrelationId(req);

  // 5xx are real failures and need an error-level trace for operators; 4xx
  // are client mistakes and only warrant a warning to avoid noisy stacks. The
  // original error is logged (with its stack) rather than the safe message.
  if (statusCode >= 500) {
    logger.error(
      { err, method: req.method, url: req.url, statusCode, requestId, correlationId },
      message,
    );
  } else {
    logger.warn(
      { err, method: req.method, url: req.url, statusCode, requestId, correlationId },
      message,
    );
  }

  const body: ApiErrorResponse = { statusCode, message, code: normalized.code };
  if (requestId !== undefined) {
    body.requestId = requestId;
  }
  if (normalized.details !== undefined) {
    body.errors = normalized.details;
  }

  res.status(statusCode).json(body);
};
