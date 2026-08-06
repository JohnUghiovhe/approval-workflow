import { HttpStatus } from '../constants/http-status.ts';
import { ERROR_CODES } from '../constants/error-codes.ts';
import { SYS_MSG } from '../constants/system.messages.ts';
import { AppError } from './app-error.ts';

export class BadRequestError extends AppError {
  constructor(message: string = SYS_MSG.BAD_REQUEST, details?: unknown) {
    super(HttpStatus.BAD_REQUEST, message, details, ERROR_CODES.BAD_REQUEST);
    this.name = 'BadRequestError';
  }
}
