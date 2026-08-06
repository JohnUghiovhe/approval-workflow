import { type HttpStatusCode } from '../constants/http-status.ts';
import { ERROR_CODES, type ErrorCode } from '../constants/error-codes.ts';

export class AppError extends Error {
  public readonly statusCode: HttpStatusCode;
  public readonly code: ErrorCode;
  public readonly details?: unknown;

  // code defaults to INTERNAL so a bare AppError still produces a stable code;
  // every subclass passes its own registry code instead.
  constructor(
    statusCode: HttpStatusCode,
    message: string,
    details?: unknown,
    code: ErrorCode = ERROR_CODES.INTERNAL,
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}
