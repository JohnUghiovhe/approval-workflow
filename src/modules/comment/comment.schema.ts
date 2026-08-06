import { z } from 'zod';
import { requestIdParamsSchema } from '../request/request.schema.ts';

export const AddCommentSchema = z.object({
  body: z.string().min(1),
});

// The comment route lives under /requests/:id/comments, so it validates the
// :id param like any other request part. Re-exported so callers keep one
// import.
export { requestIdParamsSchema };

export type AddCommentInput = z.infer<typeof AddCommentSchema>;
