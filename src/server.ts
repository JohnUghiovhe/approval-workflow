import app from './app.ts';
import { env } from './config/env.ts';
import prisma from './database/index.ts';
import { logger } from './shared/utils/logger.ts';

const server = app.listen(env.PORT, () => {
  logger.info(`Server listening on port ${env.PORT}`);
});

// Close the HTTP server and Prisma pool cleanly on shutdown so in-flight
// requests can finish and the process does not hang or leave connections.
async function shutdown(signal: string): Promise<void> {
  logger.info(`${signal} received, shutting down`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
