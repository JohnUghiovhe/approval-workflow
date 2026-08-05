import type { ZodError } from 'zod';

export interface ValidationIssue {
  field: string;
  message: string;
}

// Flatten Zod issues into a predictable field/message list so clients can
// render per-field errors without coupling to the Zod library.
export function formatZodError(error: ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    field: issue.path.join('.'),
    message: issue.message,
  }));
}
