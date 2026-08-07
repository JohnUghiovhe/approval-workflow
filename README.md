# Approval Workflow Service

[![CI](https://github.com/JohnUghiovhe/approval-workflow/actions/workflows/ci.yml/badge.svg)](https://github.com/JohnUghiovhe/approval-workflow/actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/JohnUghiovhe/approval-workflow)](https://github.com/JohnUghiovhe/approval-workflow/blob/main/LICENSE)

A backend service that models departmental approval requests. Authorized
reviewers can approve, reject, or return requests for correction. Every
decision follows a valid state transition and is recorded in an append-only
activity history.

Built for the Peerless backend engineer assessment. See
[docs/Approval_Workflow_TRD.md](docs/Approval_Workflow_TRD.md) for the full
requirements, [docs/API.md](docs/API.md) for the detailed API contracts and data
design, [ARCHITECTURE.md](ARCHITECTURE.md) for the implementation deep-dive, and
[DEPLOYMENT.md](DEPLOYMENT.md) for running the packaged service with Docker.

## Table of Contents

- [Tech Stack](#tech-stack)
- [Assumptions](#assumptions)
- [Getting Started](#getting-started)
- [API Documentation](#api-documentation)
- [Scripts](#scripts)
- [Environment Variables](#environment-variables)
- [Architecture](#architecture)
- [Design Trade-offs](#design-trade-offs)
- [Operational Notes](#operational-notes)
- [Testing Guide](#testing-guide)
- [Project Structure](#project-structure)
- [Implementation Notes](#implementation-notes)
- [Deferred Work & Known Limitations](#deferred-work--known-limitations)
- [AI Use Disclosure](#ai-use-disclosure)

## Tech Stack

- Node.js 22 + TypeScript (strict)
- Express 5
- Prisma 7 (driver adapters) + PostgreSQL 16
- Zod for validation
- Pino for logging
- Vitest + Supertest for tests
- ESLint + Prettier, Husky + lint-staged

## Assumptions

- Authentication is mocked using request headers: a reviewer's UUID is sent as
  a bearer token and treated as their id (no passwords or JWTs).
- Reviewers are pre-seeded by `npm run db:seed` (5 reviewers with sensible
  names and emails).
- All timestamps are UTC (`Timestamptz(3)`).
- The data is synthetic and for the assessment only.
- The service deploys as a single process against a single PostgreSQL database.

## Getting Started

Prerequisites: Node.js 22 LTS or newer, and Docker for the local PostgreSQL
container.

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

For containerized deployment, reverse-proxy setup, and production secrets, see
[DEPLOYMENT.md](DEPLOYMENT.md).

## API Documentation

Interactive docs are served by Swagger UI at http://localhost:3000/api/docs,
with the machine-readable spec at http://localhost:3000/api/docs/openapi.json
(source of truth: [`docs/openapi.yaml`](docs/openapi.yaml)).

The detailed API reference lives in [docs/API.md](docs/API.md): endpoint
contracts, validation rules, error responses, the full cURL walkthrough, the
persistence model, and migration instructions.

Here is a skeletal example to get started. Create a request:

```sh
curl -s -X POST http://localhost:3000/api/requests \
  -H "Content-Type: application/json" \
  -d '{"title":"Laptop upgrade for design team","description":"Replace aging laptops.","department":"Engineering","requesterName":"Olu Smith"}'
```

Response `201`:

```json
{
  "statusCode": 201,
  "message": "Request created successfully",
  "data": {
    "id": "050de558-2ec7-401f-8bc3-911ebecb6202",
    "title": "Laptop upgrade for design team",
    "description": "Replace aging laptops.",
    "department": "Engineering",
    "requesterName": "Olu Smith",
    "status": "SUBMITTED",
    "createdAt": "2026-08-06T09:00:00.000Z",
    "updatedAt": "2026-08-06T09:00:00.000Z",
    "comments": [],
    "activities": []
  }
}
```

A request starts in `SUBMITTED`. See [docs/API.md](docs/API.md) for the full
lifecycle walkthrough (list, view, decide, resubmit, comment, activities) and
every error case.

## Scripts

| Command                 | Purpose                                                     |
| ----------------------- | ----------------------------------------------------------- |
| `npm run dev`           | Start with hot reload (tsx watch)                           |
| `npm run build`         | Compile TypeScript to `dist/`                               |
| `npm start`             | Run the compiled server                                     |
| `npm run typecheck`     | Typecheck `src/`, `tests/`, and root config files (no emit) |
| `npm run lint`          | ESLint over `src/`, `tests/`, and root config files         |
| `npm run format:check`  | Verify Prettier formatting                                  |
| `npm test`              | Run Vitest once                                             |
| `npm run test:watch`    | Run Vitest in watch mode                                    |
| `npm run test:coverage` | Run Vitest with V8 coverage and ≥80% thresholds             |
| `npm run db:migrate`    | Create/apply a Prisma migration (use `-- --name <name>`)    |
| `npm run db:seed`       | Seed reviewers and requests (idempotent)                    |
| `npm run db:studio`     | Open Prisma Studio                                          |

## Environment Variables

All variables are declared and validated in `src/config/env.ts` (Zod); missing
or malformed config fails fast at boot. `npm run dev` loads `.env` via dotenv.

| Variable               | Description                                                                          | Default                                          |
| ---------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------ |
| `NODE_ENV`             | `development`, `test`, or `production`                                               | `development`                                    |
| `PORT`                 | HTTP port the server binds to                                                        | `3000`                                           |
| `DATABASE_URL`         | PostgreSQL connection string                                                         | required (throwaway value under `NODE_ENV=test`) |
| `LOG_LEVEL`            | Pino level: `fatal` \| `error` \| `warn` \| `info` \| `debug` \| `trace` \| `silent` | `info`                                           |
| `RATE_LIMIT_MAX`       | Max requests allowed per client IP within the window                                 | `100`                                            |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window length                                                             | `900000` (15 min)                                |
| `REQUEST_TIMEOUT_MS`   | Time after which an in-flight request responds 408                                   | `30000` (30 s)                                   |
| `JSON_BODY_LIMIT`      | Maximum accepted JSON body size                                                      | `100kb`                                          |
| `TRUST_PROXY`          | Number of trusted reverse-proxy hops                                                 | `0`                                              |

`TEST_DATABASE_URL` points the DB-backed test suites at a different Postgres
(e.g. CI); it defaults to the local `postgres_test` service.

## Architecture

The service is layered: Route -> Controller -> Service -> Repository -> Prisma,
with one flat folder per feature module (`request`, `decision`, `comment`,
`reviewer`, `activity`, `health`). Services enforce business rules and never
touch Prisma directly; modules route database access through their own
repository. See [ARCHITECTURE.md](ARCHITECTURE.md) for the domain model (ERD),
the enforced state machine, concurrency handling, security model, and
scalability notes.

## Design Trade-offs

Every major choice is justified with a trade-off in
[ARCHITECTURE.md](ARCHITECTURE.md). The headline decisions:

- **Express over NestJS**: minimal machinery; the layering is enforced by
  convention instead of a DI container.
- **Prisma over TypeORM**: schema-first with a typed generated client and
  reviewed SQL migrations.
- **Mock header auth**: reviewer UUID as bearer token keeps the scope on the
  workflow; no JWT infrastructure. See the known limitations below.
- **Transactional decisions with a guarded update**: concurrent duplicates are
  detected and surfaced as `409`, not silently lost.
- **Offset pagination**: simple and predictable; keyset pagination is the
  documented upgrade path.
- **Single service, single Postgres**: simpler operations with no replication;
  appropriate for this workload.

## Operational Notes

### Rate limiting and timeouts

Every request is subject to a per-IP rate limit (`RATE_LIMIT_MAX` requests per
`RATE_LIMIT_WINDOW_MS`) and a request timeout (`REQUEST_TIMEOUT_MS`). Exceeding
the limit returns `429 TOO_MANY_REQUESTS`; exceeding the timeout returns
`408 REQUEST_TIMEOUT`. Both use the standard error envelope and are logged at
warn level with the correlation id. The `/health` endpoints are always excluded
so orchestration probes are never throttled, and a timed-out request never
aborts an in-flight database transaction.

### Request correlation IDs

Every request carries a correlation id: the `x-request-id` header is honored
when present and a UUID is generated otherwise. It is echoed on the
`x-request-id` response header and written as `correlationId` on access-log and
error-handler log lines so a single request can be traced end to end.

### Health endpoints

| Endpoint            | Purpose                                                 | Response                                   |
| ------------------- | ------------------------------------------------------- | ------------------------------------------ |
| `GET /health`       | Liveness: the process answers, so it always returns 200 | 200 with the app-only liveness report      |
| `GET /health/ready` | Readiness: reports the database state                   | 200 when the DB is reachable, 503 when not |

Both are excluded from the access log. `/health/ready` reports `healthy` when
the database answers `SELECT 1` and `degraded` otherwise, without leaking
connection details.

### Logging

All logging goes through Pino. In development the output is pretty-printed; in
every other environment it is structured JSON, one object per line. The level
comes from `LOG_LEVEL` and is forced to `silent` under `NODE_ENV=test`. Health
probes are excluded from the access log, and 5xx responses are flagged as
`request errored` so failed traffic is easy to grep.

### Troubleshooting

| Symptom                                | Likely cause                                                   | How to diagnose and fix                                                                                                                                                      |
| -------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/health/ready` returns 503 `degraded` | Database unreachable                                           | Restart with `docker compose up -d` and confirm `docker compose ps`. DB-dependent requests log 500 `DB_ERROR` with `ECONNREFUSED`.                                           |
| 400 `BAD_REQUEST` on a decision        | Decision violates the workflow transition table                | The request already left `Submitted` or is terminal (`Rejected`). See the transition table in `docs/Approval_Workflow_TRD.md`; the warn line carries the request id and url. |
| 409 `CONFLICT` on a decision           | Duplicate decision for the same request                        | Only the first decision wins; `errors.request_id` identifies the request. Check the history with `GET /api/requests/:id/activities`.                                         |
| 429 `TOO_MANY_REQUESTS`                | Client exceeded `RATE_LIMIT_MAX` within `RATE_LIMIT_WINDOW_MS` | Raise the env limits if legitimate; the `RateLimit-*` response headers show the quota and remaining count. Health endpoints are never throttled.                             |
| 408 `REQUEST_TIMEOUT`                  | Request exceeded `REQUEST_TIMEOUT_MS`                          | A slow query or a blocked route handler; the warn line logs method, url, and requestId. The timeout never aborts an in-flight DB transaction.                                |
| 500 `INTERNAL` or `DB_ERROR`           | Unhandled exception or unmapped database failure               | The error-level line logs the original error and full stack. The response body only carries the safe message, never raw Prisma or SQL details.                               |

## Testing Guide

Vitest runs the suite. DB-backed tests hit the real PostgreSQL test instance
(`postgres_test`, port 5434) through Prisma; they detect when it is unreachable
and skip themselves with a note rather than fail, so unit-only work never
breaks. Set `TEST_DATABASE_URL` to point the suites at a different Postgres
(e.g. the one CI provisions on port 5432); it defaults to the local
`postgres_test` service.

```sh
npm test                   # run once
npm run test:watch         # re-run on change
npm run test:coverage      # run once with V8 coverage
```

Coverage is collected over `src/` and thresholds are enforced (all ≥80%:
lines, functions, branches, statements), so the run fails when coverage drops
below the bar. The boot and seed entrypoints (`src/server.ts`,
`src/database/seed.ts`) are excluded from the report because they are exercised
by `npm run build` / startup probes and `npm run db:seed`, not by the test
suite.

### Layout

- Unit tests live next to their module in
  `src/modules/<module>/tests/*.test.ts`. They run in isolation with mocked
  repositories and assert controller/service behavior, validation, and state
  transitions.
- Integration tests live in `tests/*.integration.test.ts`. They run against
  the real server (Supertest) and database, use a `globalSetup` that creates
  the test database and runs migrations, and reset state between files.
- `tests/helpers/` holds shared test utilities:
  - `factories.ts` - `createReviewer()` and `createRequest()` seed rows
    quickly with sensible defaults.
  - `assertions.ts` - `expectErrorResponse()` asserts the exact error
    envelope (status code, `code`, and message).
  - `database.ts` - `isDatabaseAvailable()` backs the auto-skip behavior.
  - `cleanup.ts` - `resetDatabase()` truncates tables between suites.

### What is covered

- Request lifecycle: create, list with pagination and status filters, view,
  and the 404 path.
- Decisions: approve, reject, and return, including the workflow transition
  table, duplicate-decision conflicts, and the reviewer authorization check.
- Comments and activities, including the append-only activity history.
- Health endpoints (liveness versus readiness) and the rate-limiter and
  timeout middleware.
- OpenAPI contract validation: the integration suite in
  `tests/contract.integration.test.ts` starts the real server, exercises each
  endpoint, and validates every response against its schema in
  `docs/openapi.yaml` using `@apidevtools/swagger-parser` plus Ajv. It covers
  `RequestResponse`, `ListRequestsResponse`, `DecisionResponse`,
  `CommentResponse`, `ActivitiesResponse`, `LivenessResponse`, and
  `HealthResponse`, so any change that drifts the live API from the spec
  fails the suite.

### Before you push

```sh
npm run lint
npm run format:check
npm run typecheck
npm test
```

Husky runs the same checks on commit through lint-staged.

## Project Structure

```text
src/
├── app.ts                  Express app assembly (middleware, 404, error handler)
├── server.ts               Boot + graceful shutdown
├── config/                 Zod-validated env loader (env.ts) and OpenAPI config (openapi.ts)
├── database/               Prisma schema, migrations, seed, client singleton
├── modules/                Feature modules (request, decision, comment, reviewer, activity, health)
│   └── <module>/           Controller, service, repository, routes, schema, types + tests/
│                           (reviewer is an auth middleware; activity/health skip the schema)
├── routes/                 Route aggregation under /api and Swagger docs routes
└── shared/
    ├── constants/          HttpStatus, SYS_MSG, and error-code constants
    ├── errors/             AppError base + typed subclasses, Zod formatter
    ├── middleware/         validate, rate limiter, timeout, error handler, 404 handler
    ├── types/              Shared API response types
    ├── utils/              Logger, response helpers, async wrapper, health paths
    └── validators/         Shared Zod schemas (pagination)
tests/                      Global integration, contract, and validation tests + helpers
docs/                       TRD, API reference, OpenAPI spec
```

Other notable files at the root: `ARCHITECTURE.md` (design deep-dive),
`DEPLOYMENT.md` (Docker packaging), `Dockerfile`, `docker-compose.yml`,
`LICENSE`, and `docs/openapi.yaml` (the OpenAPI source of truth).

## Implementation Notes

- Architecture is layered: Controller -> Service -> Repository -> Prisma.
- All responses use the shared JSON envelope; unmatched routes return a JSON
  404 through `src/shared/middleware/not-found.ts`.
- `src/generated/` is produced by `prisma generate` and is gitignored.

## Deferred Work & Known Limitations

This section records the intentional scope cuts for the MVP and the limits
that are accurate to the current code. It is the source of truth for what the
service does and does not do, so reviewers can judge the trade-offs against
the assessment criteria.

### Deferred for MVP

Each of these was deliberately left out to keep the scope on one complete,
dependable workflow rather than broad infrastructure:

| Deferred item       | Rationale                                                                 |
| ------------------- | ------------------------------------------------------------------------- |
| Email notifications | Deciding parties would be notified out-of-band; requires SMTP/queue infra |
| File uploads        | Requests carry no attachments or evidence; would add storage/validation   |
| Approval chains     | Multi-step workflows with ordered approvers; the MVP models one decision  |
| RBAC                | Only a single reviewer role is modeled; no role hierarchy is enforced     |
| Admin dashboard     | Swagger UI documents the API; a management UI is out of scope             |
| Multi-tenancy       | No organization/workspace isolation; single-team deployment assumed       |
| Request templates   | No reusable form templates for common request types                       |
| Workflow designer   | No UI for authoring workflows; the state machine is code-defined          |

### Known Limitations (accurate to current code)

- **Header-based mock auth, no token validation**: the bearer token is treated
  directly as a reviewer UUID and looked up by primary key
  (`src/modules/reviewer/reviewer.middleware.ts`). There is no signing,
  expiry, or refresh; the token is a seeded reviewer id, not a JWT.
- **Offset-based pagination only**: lists use `page`/`pageSize` mapped to
  Prisma `skip`/`take` (`src/modules/request/request.service.ts`). Deep pages
  become slower; there is no keyset/cursor pagination.
- **Single service**: one process serves the API; there are no queues, workers,
  or shards.
- **Synchronous processing**: every decision and activity write completes
  within the request lifecycle; there are no background jobs.
- **Single PostgreSQL**: one `DATABASE_URL` with no read replicas. The
  `postgres_test` container is test isolation, not replication.
- **No request encryption at rest**: columns are stored plaintext; transport is
  the only encryption layer (TLS via the reverse proxy).
- **Reviewer role stored but not enforced**: a `role` column exists on the
  reviewer entity, but no role-based rules are applied, so this is not RBAC.

### Prioritized Improvements

Quick wins:

- Response caching for `GET /requests` list reads (in-memory or Redis with a
  short TTL), keeping pagination and filter combinations in the cache key.
- Read replicas: route analytics-heavy reads to a replica while writes stay on
  the primary.
- Keyset/cursor pagination for deep lists to bound query cost.
- Tuned indexes once real list filter patterns are known.

Major refactors:

- Real authentication (JWT/OIDC with validation, expiry, and refresh) to
  replace the header-mocked reviewer lookup.
- Asynchronous processing (job queues) for notifications, exports, and other
  out-of-band work.
- Distributed tracing (OpenTelemetry) for cross-service diagnostics.
- Encryption at rest (column-level or application-level).
- Multi-tenancy and RBAC once more than one team or role is in scope.

## AI Use Disclosure

This project was developed with the assistance of AI coding tools, and the
author has reviewed, validated, and owns the final implementation and every
decision in it. AI output was always checked against the actual codebase,
corrected where it drifted, and covered by the automated suite before being
accepted. The following lists the tools and the specific tasks each assisted
with, without overstating the division of work.

**Tasks AI assisted with**

- **Tests**: optimizing unit, integration, contract, and coverage suites that
  assert the workflow rules, duplicate-decision safety, and error envelopes.
- **Docs**: scaffolding the API walkthrough and contracts in
  docs/API.md, ARCHITECTURE.md, DEPLOYMENT.md, and the OpenAPI spec served by
  Swagger UI.
- **Debugging**: tracing failing tests and Prisma/Express edge cases, mapping
  error codes, and fixing the issues they exposed.

**Final ownership**

Every line of code, every test, and every documented decision was reviewed
and validated by the author (John Ughiovhe) before submission. The author
performed the final quality and security audit, ran the full suite, and takes
responsibility for the implementation as delivered. AI suggestions that did
not survive that review were discarded.
