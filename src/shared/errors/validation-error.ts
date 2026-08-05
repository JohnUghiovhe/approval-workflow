import { HttpStatus } from '../constants/http-status.ts';
import { SYS_MSG } from '../constants/system.messages.ts';
import { AppError } from './app-error.ts';

export class ValidationError extends AppError {
  constructor(message: string = SYS_MSG.VALIDATION_ERROR, details?: unknown) {
    super(HttpStatus.UNPROCESSABLE_ENTITY, message, details);
    this.name = 'ValidationError';
  }
}
