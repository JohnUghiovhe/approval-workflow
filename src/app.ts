import express, { type Application } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import { httpLogger } from './shared/utils/logger.ts';
import { errorHandler } from './shared/middleware/error-handler.ts';
import { notFoundHandler } from './shared/middleware/not-found.ts';
import { rateLimiter } from './shared/middleware/rate-limiter.ts';
import { requestTimeout } from './shared/middleware/timeout.ts';
import { env } from './config/env.ts';
import healthRouter from './modules/health/health.routes.ts';
import apiRouter from './routes/index.ts';
import docsRouter from './routes/docs.routes.ts';

const app: Application = express();

// Respect reverse proxy deployments: allow configuring the trust proxy
// hop count via environment. Default 0 keeps behavior unchanged locally.
if (env.TRUST_PROXY > 0) {
  app.set('trust proxy', env.TRUST_PROXY);
}

app.use(httpLogger);
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(rateLimiter);
app.use(requestTimeout);
app.use(express.json({ limit: env.JSON_BODY_LIMIT }));

// Health lives outside /api and is mounted before the aggregate router so
// liveness/readiness probes never collide with request routing.
app.use('/health', healthRouter);

// Swagger UI and the machine-readable spec live under /api/docs so the
// documentation namespace is part of the API.
app.use('/api/docs', docsRouter);

app.use('/api', apiRouter);

// notFoundHandler turns unmatched routes into a JSON 404; errorHandler must
// be registered last so it catches errors from every route.
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
