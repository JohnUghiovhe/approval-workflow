import type { Request, RequestHandler } from 'express';
import type { ZodType } from 'zod';
import { SYS_MSG } from '../constants/system.messages.ts';
import { formatZodError } from '../errors/error-formatter.ts';
import { ValidationError } from '../errors/validation-error.ts';

type ValidationSource = 'body' | 'query' | 'params';

export interface ValidationSchema {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

// Typed view of the request used to write parsed values back in place so
// controllers see normalized data (coerced numbers, trimmed strings, applied
// defaults). The assertion is the single documented escape hatch in the
// middleware; everything downstream stays fully typed.
type ParsedRequest = Request & { body?: unknown; query?: unknown; params?: unknown };

// Build an Express middleware that parses each configured request part
// against its Zod schema and forwards a 422 on the first failure.
export function validate(schema: ValidationSchema): RequestHandler {
  const sources = Object.keys(schema) as ValidationSource[];

  return (req, res, next) => {
    const parsedRequest = req as ParsedRequest;
    for (const source of sources) {
      const sourceSchema = schema[source];
      if (!sourceSchema) {
        continue;
      }
      const result = sourceSchema.safeParse(req[source]);
      if (!result.success) {
        next(new ValidationError(SYS_MSG.VALIDATION_ERROR, formatZodError(result.error)));
        return;
      }
      // Express 5 exposes req.query as a getter-only accessor, so a direct
      // assignment throws in strict mode. Replacing the property with a plain,
      // writable data property works for body, query and params alike.
      Object.defineProperty(parsedRequest, source, {
        value: result.data,
        configurable: true,
        enumerable: true,
        writable: true,
      });
    }
    next();
  };
}
