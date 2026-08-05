// Prisma 7 loads env and CLI options from this file. Load dotenv first so
// the datasource URL below is populated from .env before validation.
import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'src/database/schema.prisma',
  migrations: {
    path: 'src/database/migrations',
    seed: 'tsx src/database/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
