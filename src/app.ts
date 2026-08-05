import express, { type Application } from 'express';
import helmet from 'helmet';
import cors from 'cors';

const app: Application = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

export default app;
