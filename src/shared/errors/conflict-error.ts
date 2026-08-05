import { HttpStatus } from '../constants/http-status.ts';
import { SYS_MSG } from '../constants/system.messages.ts';
import { AppError } from './app-error.ts';

export class ConflictError extends AppError {
  constructor(message: string = SYS_MSG.CONFLICT, details?: unknown) {
    super(HttpStatus.CONFLICT, message, details);
    this.name = 'ConflictError';
  }
}
