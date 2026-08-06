import { z } from 'zod';

export const AddCommentSchema = z.object({
  body: z.string().min(1),
});

// The comment route lives under /requests/:id/comments, so it validates the
// :id param like any other request part (rule 4).
export const requestIdParamsSchema = z.object({
  id: z.string().min(1),
});

export type AddCommentInput = z.infer<typeof AddCommentSchema>;
