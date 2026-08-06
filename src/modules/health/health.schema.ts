import { z } from 'zod';

// Response contract for /health and /health/ready. The server builds this
// shape, so the schema is used as the source of truth in tests rather than for
// request validation.
export const healthResponseSchema = z.object({
  status: z.enum(['healthy', 'degraded']),
  timestamp: z.string().datetime(),
  uptime: z.number().nonnegative(),
  version: z.string().min(1),
  checks: z.object({
    database: z.enum(['up', 'down']),
  }),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

// Contract for the app-only liveness report on GET /health.
export const livenessResponseSchema = z.object({
  status: z.literal('ok'),
  timestamp: z.string().datetime(),
  uptime: z.number().nonnegative(),
  version: z.string().min(1),
});

export type LivenessResponse = z.infer<typeof livenessResponseSchema>;
