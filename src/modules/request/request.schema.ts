import { z } from 'zod';
import { request_status } from '../../generated/prisma/client.ts';
import { paginationQuerySchema } from '../../shared/validators/pagination.ts';

export const createRequestSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  department: z.string().min(1),
  requesterName: z.string().min(1),
});

// Optional status filter restricted to the generated request_status values so
// unknown statuses are rejected by validation before reaching the repository.
const requestStatusValues = Object.values(request_status);

export const listRequestsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(requestStatusValues as [request_status, ...request_status[]]).optional(),
});

// Shared param schema for every /requests/:id route (view, decision, comment,
// activity). UUID is the storage format, so anything else is a validation
// error instead of a DB miss.
export const requestIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export type CreateRequestInput = z.infer<typeof createRequestSchema>;
export type ListRequestsQuery = z.infer<typeof listRequestsQuerySchema>;
