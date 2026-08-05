import { HttpStatus } from '../constants/http-status.ts';
import { SYS_MSG } from '../constants/system.messages.ts';
import { AppError } from './app-error.ts';

export class ForbiddenError extends AppError {
  constructor(message: string = SYS_MSG.FORBIDDEN, details?: unknown) {
    super(HttpStatus.FORBIDDEN, message, details);
    this.name = 'ForbiddenError';
  }
}
