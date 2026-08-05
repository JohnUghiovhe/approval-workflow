import express, { type Application } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { errorHandler } from './shared/middleware/error-handler.ts';

const app: Application = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

// Must be registered last so it catches errors from every route.
app.use(errorHandler);

export default app;
