import { HttpStatus } from '../constants/http-status.ts';
import { ERROR_CODES } from '../constants/error-codes.ts';
import { SYS_MSG } from '../constants/system.messages.ts';
import { AppError } from './app-error.ts';

export class TooManyRequestsError extends AppError {
  constructor(message: string = SYS_MSG.TOO_MANY_REQUESTS, details?: unknown) {
    super(HttpStatus.TOO_MANY_REQUESTS, message, details, ERROR_CODES.TOO_MANY_REQUESTS);
    this.name = 'TooManyRequestsError';
  }
}
