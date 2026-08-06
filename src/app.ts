import express, { type Application } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { httpLogger } from './shared/utils/logger.ts';
import { errorHandler } from './shared/middleware/error-handler.ts';
import { notFoundHandler } from './shared/middleware/not-found.ts';
import healthRouter from './modules/health/health.routes.ts';
import apiRouter from './routes/index.ts';

const app: Application = express();

app.use(httpLogger);
app.use(helmet());
app.use(cors());
app.use(express.json());

// Health lives outside /api and is mounted before the aggregate router so
// liveness/readiness probes never collide with request routing.
app.use('/health', healthRouter);

app.use('/api', apiRouter);

// notFoundHandler turns unmatched routes into a JSON 404; errorHandler must
// be registered last so it catches errors from every route.
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
