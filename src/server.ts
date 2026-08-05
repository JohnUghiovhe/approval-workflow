import app from './app.ts';
import { env } from './config/env.ts';
import { logger } from './shared/utils/logger.ts';

app.listen(env.PORT, () => {
  logger.info(`Server listening on port ${env.PORT}`);
});
