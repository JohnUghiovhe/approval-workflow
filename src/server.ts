import app from './app.ts';
import { env } from './config/env.ts';
import prisma from './database/index.ts';
import { logger } from './shared/utils/logger.ts';
import type { Server } from 'http';

type ExtendedServer = Server & {
  closeIdleConnections?: () => void;
  closeAllConnections?: () => void;
};

const server = app.listen(env.PORT, () => {
  logger.info(`Server listening on port ${env.PORT}`);
});

// Close the HTTP server and Prisma pool cleanly on shutdown so in-flight
// requests can finish and the process does not hang or leave connections.
async function shutdown(signal: string): Promise<void> {
  logger.info(`${signal} received, shutting down`);
  // Close idle connections first (Node 18.2+). If the runtime does not
  // expose these helpers, the optional chaining prevents a crash.
  try {
    (server as ExtendedServer).closeIdleConnections?.();
  } catch (err) {
    logger.debug({ err }, 'closeIdleConnections not available on this Node version');
  }

  // Wait for in-flight requests to finish, then disconnect Prisma and exit.
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });

  // As a last resort, forcefully terminate after a short grace period so the
  // process does not hang indefinitely behind keep-alive sockets.
  setTimeout(() => {
    logger.warn('Graceful shutdown timed out, forcing termination');
    try {
      (server as ExtendedServer).closeAllConnections?.();
    } catch (err) {
      logger.debug({ err }, 'closeAllConnections not available on this Node version');
    }
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
