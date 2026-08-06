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
   `postgres_test` (port 5434), backs the DB-backed integration suites; they
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

| Variable               | Description                                                                          | Default                                          |
| ---------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------ |
| `NODE_ENV`             | `development`, `test`, or `production`                                               | `development`                                    |
| `PORT`                 | HTTP port the server binds to                                                        | `3000`                                           |
| `DATABASE_URL`         | PostgreSQL connection string                                                         | required (throwaway value under `NODE_ENV=test`) |
| `LOG_LEVEL`            | Pino level: `fatal` \| `error` \| `warn` \| `info` \| `debug` \| `trace` \| `silent` | `info`                                           |
| `RATE_LIMIT_MAX`       | Max requests allowed per client IP within the window                                 | `100`                                            |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window length                                                             | `900000` (15 min)                                |
| `REQUEST_TIMEOUT_MS`   | Time after which an in-flight request responds 408                                   | `30000` (30 s)                                   |
| +                      | `JSON_BODY_LIMIT`                                                                    | Maximum accepted JSON body size                  | `100kb` |
| +                      | `TRUST_PROXY`                                                                        | Number of trusted reverse-proxy hops             | `0`     |

## Rate Limiting and Timeouts

Every request is subject to a per-IP rate limit (`RATE_LIMIT_MAX` requests per
`RATE_LIMIT_WINDOW_MS`) and a request timeout (`REQUEST_TIMEOUT_MS`). When the
limit is exceeded the API responds `429` with `code: TOO_MANY_REQUESTS`; when a
request exceeds the timeout it responds `408` with `code: REQUEST_TIMEOUT`.
Both follow the standard error envelope and are logged at warn level with the
correlation ID. The 408 envelope is only returned while the response headers
have not yet been sent; if the route has already started responding, the
timeout ends the response instead, so the client may receive the status already
sent by the route with a truncated body. The `/health` endpoints are always
excluded so orchestration probes are never throttled or cut off, and a timed-out
request never aborts an in-flight database transaction.

## Request Correlation IDs

Every request is assigned a correlation ID. The `x-request-id` request header
is honored when present (for example when seeded by an upstream gateway) and a
UUID is generated otherwise. The same value is echoed back on the
`x-request-id` response header, carried on `req.id` in middleware, and written
as `correlationId` on access-log and error-handler log lines so a single
request can be traced end to end.

## Error Codes

Errors use the shared envelope with a stable `code` that clients can branch on:

```json
{
  "statusCode": 409,
  "message": "Conflict with the current state of the resource",
  "code": "CONFLICT",
  "requestId": "3f0a3b1e-...",
  "errors": { "request_id": "8c1a..." }
}
```

`requestId` and `errors` are present only when relevant. The registry lives in
`src/shared/constants/error-codes.ts`:

| Code                | Meaning                                 | HTTP status |
| ------------------- | --------------------------------------- | ----------- |
| `BAD_REQUEST`       | Malformed request or invalid transition | 400         |
| `UNAUTHORIZED`      | Missing/invalid authorization           | 401         |
| `NOT_FOUND`         | Resource not found                      | 404         |
| `CONFLICT`          | State conflict or duplicate decision    | 409         |
| `VALIDATION_ERROR`  | Zod validation failed                   | 422         |
| `TOO_MANY_REQUESTS` | Client exceeded the rate limit          | 429         |
| `REQUEST_TIMEOUT`   | Request exceeded the timeout            | 408         |
| `DB_ERROR`          | Unmapped database failure               | 500         |
| `INTERNAL`          | Unhandled internal error                | 500         |

Prisma constraint failures are folded into the same structure: unique violation
(`P2002`) becomes 409 `CONFLICT`, missing record (`P2025`) becomes 404
`NOT_FOUND`, foreign key violation (`P2003`) becomes 422 `VALIDATION_ERROR`, and
any other Prisma error becomes a generic 500 `DB_ERROR`. Malformed JSON bodies
rejected by the body parser become 400 `BAD_REQUEST`. Internal errors always
respond with `SYS_MSG.INTERNAL_SERVER_ERROR`; raw Prisma messages, SQL, and
stack traces are logged but never sent to the client.

## Health Endpoints

Operational probes live at the top level (outside `/api`) and are excluded from
the access log:

| Endpoint            | Purpose                                                 | Response                                   |
| ------------------- | ------------------------------------------------------- | ------------------------------------------ |
| `GET /health`       | Liveness: the process answers, so it always returns 200 | 200 with the app-only liveness report      |
| `GET /health/ready` | Readiness: reports the database state                   | 200 when the DB is reachable, 503 when not |

The readiness report follows the standard envelope:

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

`GET /health/ready` reports `status` as `healthy` when the database responds to
`SELECT 1` and `degraded` otherwise. The report never leaks the database URL or
other connection details. `GET /health` is the liveness probe: it always
returns 200 with an app-only report (`status: "ok"`, no `checks`) and never
touches the database, so orchestration can restart a hung process even when the
database is unreachable.

## Operations & Logging

All logging goes through Pino. In development the output is pretty-printed; in
every other environment it is structured JSON, one object per line. The level
comes from `LOG_LEVEL` and is forced to `silent` under `NODE_ENV=test`. Health
probes are excluded from the access log, and every request-scoped line carries
`correlationId` so it can be matched to the [request correlation ID](#request-correlation-ids)
echoed in the `x-request-id` response header.

Successful access line (GET `/api/requests`, 200):

```json
{
  "level": 30,
  "time": 1786009635029,
  "req": {
    "id": "doc-trace-abc123",
    "method": "GET",
    "url": "/api/requests",
    "remoteAddress": "::1"
  },
  "correlationId": "doc-trace-abc123",
  "res": { "statusCode": 200 },
  "responseTime": 355,
  "msg": "request completed"
}
```

Client error line (invalid POST body, logged at warn by the error handler):

```json
{
  "level": 40,
  "err": {
    "type": "ValidationError",
    "message": "Validation failed",
    "code": "VALIDATION_ERROR",
    "details": [
      { "field": "title", "message": "Too small: expected string to have >=1 characters" }
    ]
  },
  "method": "POST",
  "url": "/api/requests",
  "statusCode": 422,
  "correlationId": "970c789b-...",
  "msg": "Validation failed"
}
```

Server error line (database unreachable, logged at error with the full stack):

```json
{
  "level": 50,
  "err": { "type": "PrismaClientKnownRequestError", "code": "ECONNREFUSED", "stack": "..." },
  "method": "GET",
  "url": "/api/requests",
  "statusCode": 500,
  "correlationId": "doc-trace-abc123",
  "msg": "An unexpected error occurred"
}
```

5xx responses are also flagged by the access logger as `request errored` instead
of `request completed`, so failed traffic is easy to grep. See [Error Codes](#error-codes)
for the full response code reference and [Health Endpoints](#health-endpoints) for
liveness versus readiness.

### Troubleshooting

| Symptom                                | Likely cause                                                   | How to diagnose and fix                                                                                                                                                      |
| -------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/health/ready` returns 503 `degraded` | Database unreachable                                           | Restart with `docker compose up -d` and confirm `docker compose ps`. DB-dependent requests log 500 `DB_ERROR` with `ECONNREFUSED`.                                           |
| 400 `BAD_REQUEST` on a decision        | Decision violates the workflow transition table                | The request already left `Submitted` or is terminal (`Rejected`). See the transition table in `docs/Approval_Workflow_TRD.md`; the warn line carries the request id and url. |
| 409 `CONFLICT` on a decision           | Duplicate decision for the same request                        | Only the first decision wins; `errors.request_id` identifies the request. Check the history with `GET /api/requests/:id/activities`.                                         |
| 429 `TOO_MANY_REQUESTS`                | Client exceeded `RATE_LIMIT_MAX` within `RATE_LIMIT_WINDOW_MS` | Raise the env limits if legitimate; the `RateLimit-*` response headers show the quota and remaining count. Health endpoints are never throttled.                             |
| 408 `REQUEST_TIMEOUT`                  | Request exceeded `REQUEST_TIMEOUT_MS`                          | A slow query or a blocked route handler; the warn line logs method, url, and requestId. The timeout never aborts an in-flight DB transaction.                                |
| 500 `INTERNAL` or `DB_ERROR`           | Unhandled exception or unmapped database failure               | The error-level line logs the original error and full stack. The response body only carries the safe message, never raw Prisma or SQL details.                               |

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
    ├── middleware/         validate, rate limiter, timeout, error handler, 404 handler
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
