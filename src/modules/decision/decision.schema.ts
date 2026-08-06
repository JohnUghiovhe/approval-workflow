import { z } from 'zod';
import { requestIdParamsSchema } from '../request/request.schema.ts';

// Notes are optional and free-form; validated on reject/return. Approve takes
// no body, so it has no schema here.
export const DecisionBodySchema = z.object({
  notes: z.string().optional(),
});

export const ResubmitSchema = z.object({
  requesterName: z.string().min(1),
});

// Decision routes live under /requests/:id/..., so they validate the :id param
// like any other body or query part. Re-exported so callers keep one import.
export { requestIdParamsSchema };

export type DecisionBodyInput = z.infer<typeof DecisionBodySchema>;
export type ResubmitInput = z.infer<typeof ResubmitSchema>;
