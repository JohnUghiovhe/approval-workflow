// Load .env before validation so process.env is populated at import time.
// All env access goes through the exported `env` object; nothing reads
// process.env directly anywhere else in the codebase.
import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
});

// Provide a throwaway DATABASE_URL under NODE_ENV=test so unit tests that
// never touch the database can run in CI without a local .env. Every other
// environment still fails fast when the URL is missing. The test database is
// provisioned by the `postgres_test` service in docker-compose.yml.
const testDatabaseUrl =
  'postgresql://test:test@localhost:5434/approval_workflow_test?schema=public';
const inputEnv = {
  ...process.env,
  DATABASE_URL:
    process.env.DATABASE_URL ?? (process.env.NODE_ENV === 'test' ? testDatabaseUrl : undefined),
};

// Fail fast on missing or malformed configuration instead of booting with
// undefined values that would only surface later at runtime.
const parsed = envSchema.safeParse(inputEnv);

if (!parsed.success) {
  // Use console here, not the pino logger: logger.ts imports env.ts, so
  // logging through it would create a circular dependency before validation.
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
