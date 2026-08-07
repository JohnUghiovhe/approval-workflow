// Prisma 7 loads env and CLI options from this file. Load dotenv first so
// the datasource URL below is populated from .env before validation.
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// `prisma generate` (run by postinstall after `npm ci`) never connects to the
// database, but Prisma still needs a resolvable datasource URL. Fall back to a
// placeholder so a fresh clone installs before .env exists, mirroring the
// Dockerfile's deps stage. Every operational command (migrate, studio, seed)
// needs the real URL: fail fast when it is genuinely missing instead of
// silently resolving to the localhost placeholder.
const command = process.argv[2] ?? '';
const isGenerateOnly = command === 'generate';

const databaseUrl = isGenerateOnly
  ? process.env.DATABASE_URL ||
    'postgresql://placeholder:placeholder@localhost:5432/placeholder?schema=public'
  : process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error(
    `DATABASE_URL is required for \`prisma ${command}\`. Set it in .env or the environment and retry.`,
  );
  process.exit(1);
}

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
