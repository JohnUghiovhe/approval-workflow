import { HttpStatus } from '../constants/http-status.ts';
import { ERROR_CODES } from '../constants/error-codes.ts';
import { SYS_MSG } from '../constants/system.messages.ts';
import { AppError } from './app-error.ts';

export class ConflictError extends AppError {
  constructor(message: string = SYS_MSG.CONFLICT, details?: unknown) {
    super(HttpStatus.CONFLICT, message, details, ERROR_CODES.CONFLICT);
    this.name = 'ConflictError';
  }
}
