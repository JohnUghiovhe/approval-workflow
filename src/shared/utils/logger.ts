import { pino, type Logger } from 'pino';
import { pinoHttp, type HttpLogger } from 'pino-http';
import { env } from '../../config/env.ts';

const isDev = env.NODE_ENV === 'development';

// Pretty-print in development for readable terminal output; structured JSON
// everywhere else. Tests stay silent to keep test output clean.
export const logger: Logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : 'info',
  ...(isDev
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' },
        },
      }
    : {}),
});

// Skip access logging for the health endpoints so orchestration probes do not
// flood the logs; the /api access lines carry the real traffic signal.
export const httpLogger: HttpLogger = pinoHttp({
  logger,
  autoLogging: { ignore: (req) => (req.url ?? '').startsWith('/health') },
});
