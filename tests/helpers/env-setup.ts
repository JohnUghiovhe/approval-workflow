// Vitest does not set NODE_ENV on its own, so the app and the prisma client
// would otherwise read DATABASE_URL from .env and hit the development
// database. Pinning NODE_ENV=test and DATABASE_URL here makes
// src/config/env.ts and dotenv fall back to the dedicated test database
// (docker-compose postgres_test), isolating the DB-backed suites from
// development data (rule 16). dotenv never overrides an existing variable, so
// setting DATABASE_URL first is what keeps .env from winning.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  'postgresql://test:test@localhost:5434/approval_workflow_test?schema=public';
