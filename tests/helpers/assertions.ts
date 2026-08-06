import { expect } from 'vitest';
import type { HttpStatusCode } from '../../src/shared/constants/http-status.ts';

export interface ExpectedErrorResponse {
  status: HttpStatusCode;
  code: string;
  message?: string;
}

// The standard error envelope is { statusCode, message, code } plus optional
// requestId and errors. Assert the shape and the optional message, and that no
// success `data` field leaks into an error payload.
export function expectErrorResponse(
  res: { status: number; body: unknown },
  expected: ExpectedErrorResponse,
): void {
  const body = res.body as Record<string, unknown>;
  expect(res.status).toBe(expected.status);
  expect(body.statusCode).toBe(expected.status);
  expect(body.code).toBe(expected.code);
  expect(body).not.toHaveProperty('data');
  if (expected.message !== undefined) {
    expect(body.message).toBe(expected.message);
  }
}
