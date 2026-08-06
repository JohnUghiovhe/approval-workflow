import type { RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../../config/env.ts';
import { TooManyRequestsError } from '../errors/too-many-requests-error.ts';

export interface RateLimitOverrides {
  limit?: number;
  windowMs?: number;
}

// Shared limiter factory so tests can shrink the window/limit without
// duplicating the health exclusion or the error routing. Production wiring
// uses the env defaults via the exported `rateLimiter` instance.
export function createRateLimiter(overrides: RateLimitOverrides = {}): RequestHandler {
  return rateLimit({
    windowMs: overrides.windowMs ?? env.RATE_LIMIT_WINDOW_MS,
    limit: overrides.limit ?? env.RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    // Liveness/readiness probes must never be throttled by a client quota.
    skip: (req) => req.path.startsWith('/health'),
    // Route rejections through the error middleware so they use the standard
    // envelope, warn-level logging, and correlation ids like any other 4xx.
    handler: (_req, _res, next) => next(new TooManyRequestsError()),
  });
}

export const rateLimiter = createRateLimiter();
