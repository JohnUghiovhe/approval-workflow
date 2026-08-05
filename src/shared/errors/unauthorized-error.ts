import { HttpStatus } from '../constants/http-status.ts';
import { SYS_MSG } from '../constants/system.messages.ts';
import { AppError } from './app-error.ts';

export class UnauthorizedError extends AppError {
  constructor(message: string = SYS_MSG.UNAUTHORIZED, details?: unknown) {
    super(HttpStatus.UNAUTHORIZED, message, details);
    this.name = 'UnauthorizedError';
  }
}
