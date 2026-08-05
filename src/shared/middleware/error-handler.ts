import type { ErrorRequestHandler } from 'express';
import { HttpStatus } from '../constants/http-status.ts';
import { SYS_MSG } from '../constants/system.messages.ts';
import { AppError } from '../errors/app-error.ts';
import type { ApiErrorResponse } from '../types/api-response.ts';

// Central error middleware. Anything not an AppError becomes a generic 500
// so internal details never leak to clients.
export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  const statusCode = err instanceof AppError ? err.statusCode : HttpStatus.INTERNAL_SERVER_ERROR;
  const message = err instanceof AppError ? err.message : SYS_MSG.INTERNAL_SERVER_ERROR;

  const body: ApiErrorResponse = { statusCode, message };
  if (err instanceof AppError && err.details !== undefined) {
    body.errors = err.details;
  }

  res.status(statusCode).json(body);
};
