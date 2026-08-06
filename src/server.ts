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
  // Stop accepting new connections first; the callback fires only after every
  // in-flight request has completed. Cleanup (including Prisma disconnect) is
  // wrapped so any failure is logged and surfaces as a non-zero exit instead
  // of being swallowed by an unhandled rejection.
  server.close(async (err?: Error) => {
    try {
      if (err) {
        throw err;
      }
      await prisma.$disconnect();
      process.exit(0);
    } catch (cleanupError) {
      logger.error({ err: cleanupError }, 'Failed to close server or disconnect database cleanly');
      process.exit(1);
    }
  });

  // As a last resort, forcefully terminate after a short grace period so the
  // process does not hang indefinitely behind keep-alive sockets. Idle
  // connections are closed first so in-flight requests still get a chance to
  // finish; if the runtime does not expose these helpers, the optional
  // chaining prevents a crash.
  setTimeout(() => {
    logger.warn('Graceful shutdown timed out, forcing termination');
    try {
      (server as ExtendedServer).closeIdleConnections?.();
    } catch (err) {
      logger.debug({ err }, 'closeIdleConnections not available on this Node version');
    }
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
