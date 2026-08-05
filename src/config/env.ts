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

// Fail fast on missing or malformed configuration instead of booting with
// undefined values that would only surface later at runtime.
const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
