// Prisma 7 loads env and CLI options from this file. Load dotenv first so
// the datasource URL below is populated from .env before validation.
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// `prisma generate` (run by postinstall after `npm ci`) never connects to the
// database, but Prisma still needs a resolvable datasource URL. Fall back to a
// placeholder so a fresh clone installs before .env exists, mirroring the
// Dockerfile's deps stage. Real operations (migrate, studio) still require
// DATABASE_URL and fail fast when it is genuinely missing.
const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://placeholder:placeholder@localhost:5432/placeholder?schema=public';

export default defineConfig({
  schema: 'src/database/schema.prisma',
  migrations: {
    path: 'src/database/migrations',
    seed: 'tsx src/database/seed.ts',
  },
  datasource: {
    url: databaseUrl,
  },
});
