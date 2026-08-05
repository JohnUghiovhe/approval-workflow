import { HttpStatus } from '../constants/http-status.ts';
import { SYS_MSG } from '../constants/system.messages.ts';
import { AppError } from './app-error.ts';

export class NotFoundError extends AppError {
  constructor(message: string = SYS_MSG.RESOURCE_NOT_FOUND, details?: unknown) {
    super(HttpStatus.NOT_FOUND, message, details);
    this.name = 'NotFoundError';
  }
}
