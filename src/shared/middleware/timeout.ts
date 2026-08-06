import type { RequestHandler } from 'express';
import { env } from '../../config/env.ts';
import { SYS_MSG } from '../constants/system.messages.ts';
import { RequestTimeoutError } from '../errors/request-timeout-error.ts';

// Factory so tests can use a short window; production wiring uses the env
// default via the exported `requestTimeout` instance.
export function createRequestTimeout(durationMs: number): RequestHandler {
  return (req, res, next) => {
    // Health probes are fast by contract, so never let them be cut off.
    if (req.path.startsWith('/health')) {
      next();
      return;
    }

    const timer = setTimeout(() => {
      if (res.writableEnded) {
        return;
      }
      if (res.headersSent) {
        // Headers are already out, so the response cannot be replaced with a
        // 408; end it to stop the socket hanging. Any in-flight work, such as a
        // DB transaction, is left to finish on the server rather than aborted.
        res.end();
        return;
      }
      // Forward a typed error so the central handler logs the 408 at warn
      // level (method, url, requestId) and sends the standard envelope.
      next(new RequestTimeoutError(SYS_MSG.REQUEST_TIMEOUT));
    }, durationMs);

    // Do not let a pending timer keep the process alive during shutdown.
    timer.unref();
    res.on('finish', () => clearTimeout(timer));
    res.on('close', () => clearTimeout(timer));
    next();
  };
}

export const requestTimeout = createRequestTimeout(env.REQUEST_TIMEOUT_MS);
