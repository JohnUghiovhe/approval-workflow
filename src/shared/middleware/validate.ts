import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';
import { HttpStatus } from '../constants/http-status.ts';
import { SYS_MSG } from '../constants/system.messages.ts';
import { AppError } from '../errors/app-error.ts';
import { formatZodError } from '../errors/error-formatter.ts';

type ValidationSource = 'body' | 'query' | 'params';

export interface ValidationSchema {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

// Build an Express middleware that parses each configured request part
// against its Zod schema and forwards a 422 on the first failure.
export function validate(schema: ValidationSchema): RequestHandler {
  const sources = Object.keys(schema) as ValidationSource[];

  return (req, res, next) => {
    for (const source of sources) {
      const sourceSchema = schema[source];
      if (!sourceSchema) {
        continue;
      }
      const result = sourceSchema.safeParse(req[source]);
      if (!result.success) {
        next(
          new AppError(
            HttpStatus.UNPROCESSABLE_ENTITY,
            SYS_MSG.VALIDATION_ERROR,
            formatZodError(result.error),
          ),
        );
        return;
      }
      // Replace the raw payload with the parsed output so controllers see
      // normalized data (coerced numbers, trimmed strings, applied defaults).
      const request = req as Record<ValidationSource, unknown>;
      request[source] = result.data;
    }
    next();
  };
}
