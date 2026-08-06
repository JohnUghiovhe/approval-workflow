import { HttpStatus } from '../constants/http-status.ts';
import { ERROR_CODES } from '../constants/error-codes.ts';
import { SYS_MSG } from '../constants/system.messages.ts';
import { AppError } from './app-error.ts';

export class RequestTimeoutError extends AppError {
  constructor(message: string = SYS_MSG.REQUEST_TIMEOUT, details?: unknown) {
    super(HttpStatus.REQUEST_TIMEOUT, message, details, ERROR_CODES.REQUEST_TIMEOUT);
    this.name = 'RequestTimeoutError';
  }
}
