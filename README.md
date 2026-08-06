# Approval Workflow Service

A backend service that models departmental approval requests. Authorized
reviewers can approve, reject, or return requests for correction. Every
decision follows a valid state transition and is recorded in an append-only
activity history.

Built for the Peerless backend engineer assessment. See
[docs/Approval_Workflow_TRD.md](docs/Approval_Workflow_TRD.md) for the full
requirements.

## Tech Stack

- Node.js 22 + TypeScript (strict)
- Express 5
- Prisma 7 (driver adapters) + PostgreSQL 16
- Zod for validation
- Pino for logging
- Vitest + Supertest for tests
- ESLint + Prettier, Husky + lint-staged

## Prerequisites

- Node.js 22 LTS or newer
- Docker (for the local PostgreSQL container)

## Getting Started

1. Install dependencies:

   ```sh
   npm install
   ```

   `postinstall` runs `prisma generate` automatically.

2. Start PostgreSQL and wait for it to become healthy:

   ```sh
   docker compose up -d postgres
   ```

   The dev database is the one the app and seed use. A second service,
   `postgres_test` (port 5433), backs the DB-backed integration suites; they
   skip themselves when it is not running. Start both with:

   ```sh
   docker compose up -d postgres postgres_test
   ```

3. Create the environment file:

   ```sh
   Copy-Item .env.example .env   # Windows PowerShell
   # cp .env.example .env         # macOS / Linux
   ```

4. Apply migrations and seed data:

   ```sh
   npm run db:migrate
   npm run db:seed
   ```

5. Run the server:

   ```sh
   npm run dev
   ```

   The API listens on http://localhost:3000.

## Scripts

| Command                | Purpose                                                     |
| ---------------------- | ----------------------------------------------------------- |
| `npm run dev`          | Start with hot reload (tsx watch)                           |
| `npm run build`        | Compile TypeScript to `dist/`                               |
| `npm start`            | Run the compiled server                                     |
| `npm run typecheck`    | Typecheck `src/`, `tests/`, and root config files (no emit) |
| `npm run lint`         | ESLint over `src/`, `tests/`, and root config files         |
| `npm run format:check` | Verify Prettier formatting                                  |
| `npm test`             | Run Vitest once                                             |
| `npm run db:migrate`   | Create/apply a Prisma migration (use `-- --name <name>`)    |
| `npm run db:seed`      | Seed reviewers and requests (idempotent)                    |
| `npm run db:studio`    | Open Prisma Studio                                          |

## Environment Variables

| Variable       | Description                                                                          | Default                                          |
| -------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------ |
| `NODE_ENV`     | `development`, `test`, or `production`                                               | `development`                                    |
| `PORT`         | HTTP port the server binds to                                                        | `3000`                                           |
| `DATABASE_URL` | PostgreSQL connection string                                                         | required (throwaway value under `NODE_ENV=test`) |
| `LOG_LEVEL`    | Pino level: `fatal` \| `error` \| `warn` \| `info` \| `debug` \| `trace` \| `silent` | `info`                                           |

## Request Correlation IDs

Every request is assigned a correlation ID. The `x-request-id` request header
is honored when present (for example when seeded by an upstream gateway) and a
UUID is generated otherwise. The same value is echoed back on the
`x-request-id` response header, carried on `req.id` in middleware, and written
as `correlationId` on access-log and error-handler log lines so a single
request can be traced end to end.

## Health Endpoints

Operational probes live at the top level (outside `/api`) and are excluded from
the access log:

| Endpoint            | Purpose                                                 | Response                                   |
| ------------------- | ------------------------------------------------------- | ------------------------------------------ |
| `GET /health`       | Liveness: the process answers, so it always returns 200 | 200 with the health report                 |
| `GET /health/ready` | Readiness: reports the database state                   | 200 when the DB is reachable, 503 when not |

The health report follows the standard envelope:

```json
{
  "statusCode": 200,
  "message": "Operation completed successfully",
  "data": {
    "status": "healthy",
    "timestamp": "2026-08-06T09:00:00.000Z",
    "uptime": 123.45,
    "version": "1.0.0",
    "checks": { "database": "up" }
  }
}
```

`status` is `healthy` when the database responds to `SELECT 1` and `degraded`
otherwise. The report never leaks the database URL or other connection details.

## Project Structure

```text
src/
├── app.ts                  Express app assembly (middleware, 404, error handler)
├── server.ts               Boot + graceful shutdown
├── config/env.ts           Zod-validated environment loader
├── database/               Prisma schema, migrations, seed, client singleton
├── modules/                Feature modules (request, decision, comment, reviewer, activity, health)
├── routes/                 Route aggregation (apiRouter under /api)
└── shared/
    ├── constants/          HttpStatus and SYS_MSG constants
    ├── errors/             AppError base + typed subclasses, Zod formatter
    ├── middleware/         validate, error handler, 404 handler
    ├── types/              Shared API response types
    ├── utils/              Logger, response helpers, async wrapper
    └── validators/         Shared Zod schemas (pagination)
tests/                      Global tests
docs/                       TRD, ticket tracking, task rules
```

## Implementation Notes

- Architecture is layered: Controller -> Service -> Repository -> Prisma.
- All responses use the shared JSON envelope; unmatched routes return a JSON
  404 through `src/shared/middleware/not-found.ts`.
- `src/generated/` is produced by `prisma generate` and is gitignored.
