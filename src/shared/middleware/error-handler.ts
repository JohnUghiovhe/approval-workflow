import type { ErrorRequestHandler } from 'express';
import { HttpStatus } from '../constants/http-status.ts';
import { SYS_MSG } from '../constants/system.messages.ts';
import { AppError } from '../errors/app-error.ts';
import type { ApiErrorResponse } from '../types/api-response.ts';
import { logger } from '../utils/logger.ts';

// Derive the failing resource id from the matched route so logs and responses
// can be correlated with the request row that failed.
function getRequestId(req: Parameters<ErrorRequestHandler>[1]): string | undefined {
  const paramId = req.params.id;
  return typeof paramId === 'string' && paramId.length > 0 ? paramId : undefined;
}

// Central error middleware. Anything not an AppError becomes a generic 500
// so internal details never leak to clients.
export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  const statusCode = err instanceof AppError ? err.statusCode : HttpStatus.INTERNAL_SERVER_ERROR;
  const message = err instanceof AppError ? err.message : SYS_MSG.INTERNAL_SERVER_ERROR;
  const requestId = getRequestId(req);

  // 5xx are real failures and need an error-level trace for operators; 4xx
  // are client mistakes and only warrant a warning to avoid noisy stacks.
  if (statusCode >= 500) {
    logger.error({ err, method: req.method, url: req.url, statusCode, requestId }, message);
  } else {
    logger.warn({ err, method: req.method, url: req.url, statusCode, requestId }, message);
  }

  const body: ApiErrorResponse = { statusCode, message };
  if (requestId !== undefined) {
    body.requestId = requestId;
  }
  if (err instanceof AppError && err.details !== undefined) {
    body.errors = err.details;
  }

  res.status(statusCode).json(body);
};
