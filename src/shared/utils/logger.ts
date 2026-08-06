import { randomUUID } from 'node:crypto';
import { pino, type Logger, type LevelWithSilent } from 'pino';
import { pinoHttp, type GenReqId, type HttpLogger } from 'pino-http';
import { env } from '../../config/env.ts';
import { isHealthPath } from './health-paths.ts';

const isDev = env.NODE_ENV === 'development';

// Pretty-print in development for readable terminal output; structured JSON
// everywhere else. Tests stay silent to keep test output clean regardless of
// the configured LOG_LEVEL.
export const logger: Logger = pino({
  level: (env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL) as LevelWithSilent,
  // Redact sensitive headers such as Authorization and cookies from logs so
  // credentials do not leak into structured log streams or downstream sinks.
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers.authorization'],
    censor: '[Redacted]',
  },
  ...(isDev
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' },
        },
      }
    : {}),
});

// Correlation header shared by request, response, and log lines. Accepting it
// inbound lets an external gateway or client seed the id, so a request can be
// traced end to end across services; the same value is echoed back on the way
// out.
const correlationIdHeader = 'x-request-id';

// Reads an inbound correlation id or generates a UUID, then echoes it on the
// response header. pino-http stores the result on req.id, which the error
// handler and customProps pick up for logging.
const genReqId: GenReqId = (req, res) => {
  const incoming = req.headers[correlationIdHeader];
  const id = typeof incoming === 'string' && incoming.length > 0 ? incoming : randomUUID();
  res.setHeader(correlationIdHeader, id);
  return id;
};

// Skip access logging for the health endpoints so orchestration probes do not
// flood the logs; the /api access lines carry the real traffic signal. The
// correlation id is bound to every request-scoped log line as correlationId.
export const httpLogger: HttpLogger = pinoHttp({
  logger,
  genReqId,
  customProps: (req) => ({ correlationId: req.id }),
  autoLogging: { ignore: (req) => isHealthPath((req.url ?? '').split('?')[0] ?? '') },
});
