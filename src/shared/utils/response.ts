import type { Response } from 'express';
import { HttpStatus, type HttpStatusCode } from '../constants/http-status.ts';
import { SYS_MSG } from '../constants/system.messages.ts';
import type { ApiResponse } from '../types/api-response.ts';

export function sendSuccess<T>(
  res: Response,
  data: T,
  message: string = SYS_MSG.OPERATION_SUCCESSFUL,
  statusCode: HttpStatusCode = HttpStatus.OK,
): Response {
  const body: ApiResponse<T> = { statusCode, message, data };
  return res.status(statusCode).json(body);
}

export function sendCreated<T>(
  res: Response,
  data: T,
  message: string = SYS_MSG.OPERATION_SUCCESSFUL,
): Response {
  return sendSuccess(res, data, message, HttpStatus.CREATED);
}
