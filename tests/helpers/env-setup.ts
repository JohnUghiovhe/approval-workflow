// Vitest does not set NODE_ENV on its own, so the app and the prisma client
// would otherwise read DATABASE_URL from .env and hit the development
// database. Pinning NODE_ENV=test here makes src/config/env.ts fall back to
// the dedicated test database (docker-compose postgres_test), isolating the
// DB-backed suites from development data (rule 16).
process.env.NODE_ENV = 'test';
