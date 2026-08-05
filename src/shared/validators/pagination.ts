import { z } from 'zod';

// Shared list-query validation. `coerce` accepts numeric query strings and
// turns them into numbers, then the defaults make every field optional.
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
});
