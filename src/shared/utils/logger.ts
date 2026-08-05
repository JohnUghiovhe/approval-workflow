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

export const httpLogger: HttpLogger = pinoHttp({ logger });
