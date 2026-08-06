import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createConnection } from 'node:net';

// The test database URL must match the NODE_ENV=test fallback in
// src/config/env.ts so migrations are applied to the same database the prisma
// client connects to. NODE_ENV is pinned here for the main thread; the
// per-worker pin lives in env-setup.ts.
process.env.NODE_ENV = 'test';
const testDatabaseUrl =
  'postgresql://test:test@localhost:5434/approval_workflow_test?schema=public';

function isDatabaseReachable(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: 'localhost', port: 5434 }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

// DB-backed suites expect a provisioned schema and skip when the database is
// unreachable (rule 16). Apply the migrations before any test file is imported
// so the suites can probe readiness with a plain SELECT 1. When the test
// database is not running, report it once and let the suites skip.
export default async function setup(): Promise<void> {
  if (!(await isDatabaseReachable())) {
    console.warn(
      'Test database (localhost:5434) is unreachable; DB-backed integration tests will be skipped.',
    );
    return;
  }

  const root = fileURLToPath(new URL('../../', import.meta.url));
  const prismaCli = fileURLToPath(
    new URL('../../node_modules/prisma/build/index.js', import.meta.url),
  );
  const prismaConfig = fileURLToPath(new URL('../../prisma.config.ts', import.meta.url));

  // The Prisma CLI logs progress to stdout and stderr, which PowerShell renders
  // as "NativeCommandError" noise in the test output. Capture it instead of
  // inheriting, and only surface it when the migration actually fails.
  const result = spawnSync(
    process.execPath,
    [prismaCli, 'migrate', 'deploy', '--config', prismaConfig],
    {
      cwd: root,
      env: { ...process.env, DATABASE_URL: testDatabaseUrl },
      encoding: 'utf8',
    },
  );

  if (result.status !== 0) {
    const stderr = (result.stderr ?? '').trim();
    const stdout = (result.stdout ?? '').trim();
    throw new Error(`prisma migrate deploy failed\n${stdout}\n${stderr}`.trim());
  }
}
