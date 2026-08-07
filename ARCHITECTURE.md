# Architecture

This document is a technical deep-dive into the Approval Workflow Service as it
is actually implemented. Every claim below is spot-checked against the source
files it links to, and the diagrams match the current Prisma schema and the
transitions enforced by the decision service.

Scope: the service models departmental approval requests. Authorized reviewers
decide (approve, reject, or return) and comment on them, every decision follows
a valid state transition, and each significant action is preserved in an
append-only activity history.

Related documents:

- Requirements: [docs/Approval_Workflow_TRD.md](docs/Approval_Workflow_TRD.md)
- Setup and API walkthrough: [README.md](README.md)

---

## 1. Repository Layout

The project follows a per-module template: every module owns its controller,
service, repository, routes, schema, types, and tests in one flat folder.

```text
src/
├── app.ts                      Express app assembly (middleware, routers, error handler)
├── server.ts                   Boot + graceful shutdown (SIGINT/SIGTERM)
├── config/
│   ├── env.ts                  Zod-validated environment loader (single source of truth)
│   ├── openapi.ts              OpenAPI document assembly for Swagger UI
│   └── tests/env.test.ts
├── database/
│   ├── index.ts                Prisma client singleton with driver adapter
│   ├── schema.prisma           Persistence model (snake_case, Timestamptz(3))
│   ├── seed.ts                 Idempotent reviewer + request + activity seeding
│   └── migrations/             Reviewed SQL migrations
├── modules/                    One folder per feature module
│   ├── request/                create, list, view
│   ├── decision/               approve, reject, return, resubmit
│   ├── comment/                add a comment
│   ├── activity/               append-only history
│   ├── reviewer/               header-based auth middleware + repository
│   └── health/                 liveness and readiness probes
├── routes/
│   ├── index.ts                Aggregates module routers under /api
│   └── docs.routes.ts          Swagger UI + OpenAPI spec routes
└── shared/
    ├── constants/              HttpStatus, SYS_MSG, ERROR_CODES
    ├── errors/                 AppError base + typed subclasses, Zod formatter
    ├── middleware/             validate, rate-limiter, timeout, not-found, error-handler
    ├── types/                  API response types, Express Request augmentation
    ├── utils/                  logger, response helpers, async wrapper, health paths
    └── validators/             Shared Zod schemas (pagination)
```

Each feature module contains the flat set of files from the template:

```text
src/modules/decision/
├── decision.controller.ts
├── decision.service.ts
├── decision.repository.ts
├── decision.routes.ts
├── decision.schema.ts
├── decision.types.ts
└── tests/decision.service.test.ts
```

The modules cross-reference each other only through well-defined seams: the
decision module reads requests through the request module's repository
(`src/modules/decision/decision.repository.ts:6`), and the comment and decision
services record audit history through the activity module's `activityService`
(see `src/modules/comment/comment.service.ts:43`).

---

## 2. Layered Architecture

Every module follows one direction of dependency:

```text
Route -> Controller -> Service -> Repository -> Prisma
```

```text
  HTTP request
       │
       ▼
  Express middleware chain (src/app.ts)
  httpLogger -> helmet -> cors -> compression -> rateLimiter
  -> requestTimeout -> express.json
       │
       ▼
  Route aggregation (src/routes/index.ts)
  apiRouter mounts request, decision, comment, activity routers under /api/requests
       │
       ▼
  Module routes + validate middleware (Zod for params/body/query)
  e.g. POST /requests/:id/approve -> requireReviewer, validate(params)
       │
       ▼
  Controller (HTTP concerns only: catches async, writes the envelope)
  decision.controller.ts -> DecisionController.approve
       │
       ▼
  Service (business rules, transactions, DTO mapping, re-validation)
  decision.service.ts -> DecisionService.decide
       │
       ▼
  Repository (data access only; client or transaction passed in)
  decision.repository.ts -> updateStatusGuarded
       │
       ▼
  Prisma generated client + @prisma/adapter-pg (src/database/index.ts)
       │
       ▼
  PostgreSQL
```

### 2.1 Data flow for one request (decide)

1. `POST /api/requests/:id/approve` reaches `src/routes/index.ts`, which mounts
   the decision router at `/requests`
   (`src/routes/index.ts:14`).
2. `requireReviewer` (`src/modules/reviewer/reviewer.middleware.ts:9`) resolves
   the `Authorization: Bearer <uuid>` header against the `reviewer` table and
   attaches `req.reviewer`. The `validate` middleware parses the `:id` param
   against a Zod UUID schema.
3. `DecisionController.approve` (`src/modules/decision/decision.controller.ts:12`)
   calls `DecisionService.decide` and replies through `sendSuccess`.
4. `DecisionService.decide` (`src/modules/decision/decision.service.ts:32`)
   validates the transition and runs the state change plus its activity row in
   one `prisma.$transaction` (details in [Section 6](#6-data-consistency)).
5. The repository executes a guarded status update and the service maps the
   fresh row through `toRequestDto` into the camelCase `DecisionDto`
   (`src/modules/decision/decision.service.ts:106`).

### 2.2 Error-handling flow

```text
  rejection or thrown error anywhere in a route handler
       │
       ▼
  catchAsync forwards to next(err)        (src/shared/utils/async-wrapper.ts)
       │
       ▼
  central errorHandler (src/shared/middleware/error-handler.ts:82)
       │
       ├─ normalizeError maps: AppError -> itself,
       │     Prisma P2002 -> 409 CONFLICT, P2025 -> 404 NOT_FOUND,
       │     P2003 -> 422 VALIDATION_ERROR, body-parser errors -> 400,
       │     anything else -> 500 (safe message only)
       │
       ├─ 5xx logged at error level, 4xx at warn level (with correlationId)
       │
       ▼
  JSON envelope: { statusCode, message, code, requestId?, errors? }
```

Unmatched routes are converted to a JSON 404 by `src/shared/middleware/not-found.ts`
so clients never see Express's default HTML page. The envelope contract lives in
`src/shared/utils/response.ts` and `src/shared/types/api-response.ts`; ad-hoc
response shapes are forbidden by the shared envelope contract.

---

## 3. Domain Model (ERD)

The model matches `src/database/schema.prisma` exactly. Four entities: `reviewer`,
`request`, `comment`, and `activity`.

```text
┌───────────────────┐
│      reviewer     │
├───────────────────┤
│ id          PK    │  uuid
│ name              │
│ email       UQ    │
│ role              │  default 'reviewer'
│ created_at        │  Timestamptz(3)
│ updated_at        │
└───────┬───────────┘
        │
        │ 1 ── writes 0..* comments   (comment.reviewer_id, Restrict on delete)
        │ 1 ── records 0..* activities(activity.reviewer_id, SetNull on delete)
        │
        ▼
┌───────────────────┐      1      0..* ┌──────────────────────┐
│      request      │───────────────►  │        comment       │
├───────────────────┤                  ├──────────────────────┤
│ id          PK    │  uuid            │ id            PK     │
│ title             │                  │ request_id    FK     │  Cascade
│ description       │                  │ reviewer_id   FK     │  Restrict
│ department        │                  │ body                 │
│ requester_name    │                  │ created_at           │
│ status      enum  │  default SUBMITTED
│ created_at        │                  └──────────────────────┘
│ updated_at        │
│ @@index(status)   │
└───────┬───────────┘
        │
        │ 1 ── has 0..* activities    (activity.request_id, Cascade on delete)
        ▼
┌──────────────────────┐
│       activity       │
├──────────────────────┤
│ id            PK     │  uuid
│ request_id    FK     │  Cascade
│ reviewer_id   FK ?   │  SetNull when reviewer deleted
│ action        enum   │  SUBMISSION | APPROVAL | REJECTION | RETURN
│                      │  | RESUBMISSION | COMMENT
│ from_status   enum ? │  request_status
│ to_status     enum ? │  request_status
│ note          ?      │  requester name or comment body / decision notes
│ created_at           │  Timestamptz(3)
│ @@index(request_id)  │
│ @@index(reviewer_id) │
└──────────────────────┘
```

Cardinality summary:

| Relationship         | Cardinality          | Foreign key            | Referential action |
| -------------------- | -------------------- | ---------------------- | ------------------ |
| reviewer -> comment  | 1 to many            | `comment.reviewer_id`  | Restrict           |
| request -> comment   | 1 to many            | `comment.request_id`   | Cascade            |
| reviewer -> activity | 1 to many (optional) | `activity.reviewer_id` | SetNull            |
| request -> activity  | 1 to many            | `activity.request_id`  | Cascade            |

Key design points:

- All columns are snake_case; the API is camelCase. The mapping happens in the
  service DTO functions (`toRequestDto`, `toCommentDto`, `toActivityDto`).
- `request.status` is a Postgres enum (`request_status`) with a dedicated index
  because it drives the list filter and every decision query.
- `activity` is append-only at the repository boundary: `src/modules/activity/activity.repository.ts`
  exposes only `create`, `createMany`, and `listByRequestId` - no update or
  delete helpers exist.
- `activity.reviewer_id` is nullable because submission and resubmission are
  requester actions, not reviewer actions. When a reviewer is deleted, their
  activity rows keep `reviewer_id` null via `onDelete: SetNull`, preserving the
  audit trail while comments (Restrict) block deleting an active reviewer.
- All timestamps are `@db.Timestamptz(3)` (UTC), applied in migration
  `src/database/migrations/20260805153426_timestamptz_timestamps/migration.sql`.

---

## 4. State Machine

The ticket sketch in this assessment describes `SUBMITTED -> IN_REVIEW -> ...`,
but the implemented schema and decision service do not contain an `IN_REVIEW`
state. Following the current repo structure over the ticket's own wording, this
document describes the transitions the code actually enforces (the TRD workflow
table in [docs/Approval_Workflow_TRD.md](docs/Approval_Workflow_TRD.md) matches
these).

Enforced transitions (in `src/modules/decision/decision.service.ts:22`):

```text
                approve ────────────────────────► APPROVED   (terminal)
              /
  SUBMITTED ──┤ reject ────────────────────────► REJECTED   (terminal)
              \
                return ────────────────────────► RETURNED
                                                    │
                                                    │ resubmit (requester action)
                                                    ▼
                                                SUBMITTED
```

| Current status | Action   | Next status | Enforced by                                     |
| -------------- | -------- | ----------- | ----------------------------------------------- |
| SUBMITTED      | approve  | APPROVED    | `validateTransition` (`decision.service.ts:23`) |
| SUBMITTED      | reject   | REJECTED    | `validateTransition`                            |
| SUBMITTED      | return   | RETURNED    | `validateTransition`                            |
| RETURNED       | resubmit | SUBMITTED   | explicit check (`decision.service.ts:124`)      |
| APPROVED       | (any)    | none        | `validateTransition` returns false              |
| REJECTED       | (any)    | none        | `validateTransition` returns false              |

Notes:

- There is no `IN_REVIEW` state. A submitted request is immediately reviewable;
  a reviewer's `approve`/`reject`/`return` is the review. The transition guard
  treats APPROVED and REJECTED as terminal, and RETURNED as re-openable only via
  resubmission (the requester's action, not a reviewer's).
- `resubmit` is not a reviewer action: it takes `requesterName` and records a
  `RESUBMISSION` activity, so `reviewerId` in the response is null
  (`decision.service.ts:167`).
- Decisions only ever move a request forward in the table; there is no path back
  from APPROVED or REJECTED, and RETURNED cannot be decided directly without a
  resubmission first.

---

## 5. Design Decisions and Rationale

Every significant choice below is justified with the trade-off that was
accepted.

### 5.1 Per-module structure over cross-cutting services

Each feature owns its controller, service, repository, routes, schema, types,
and tests in one flat folder. Dependencies between modules are explicit and
narrow (decision reuses the request repository; services reuse the activity
service).

- Trade-off: a single shared "workflow" service would centralize the rules but
  would couple every module to one god object. The per-module split keeps tests
  local to the code they verify (`src/modules/<module>/tests/`).

### 5.2 Express (not NestJS)

Express 5 provides routing and middleware with no framework machinery. The
layering (Route -> Controller -> Service -> Repository) is enforced by project
convention rather than by a DI container.

- Trade-off: NestJS gives more structure and dependency injection out of the
  box, but adds decorator abstractions and a heavier mental model. For a service
  this size, manual constructor injection (`new RequestService()`) keeps the
  dependency graph visible. Express 5 also auto-forwards async rejections, but
  handlers are still wrapped in `catchAsync` explicitly for clarity.

### 5.3 Prisma (not TypeORM)

Prisma 7 uses a schema-first DSL (`src/database/schema.prisma`), a generated
typed client (`src/generated/`, gitignored), and a driver adapter
(`@prisma/adapter-pg`, `src/database/index.ts:7`). Migrations are reviewed SQL.

- Trade-off: Prisma's query API is higher level than TypeORM's and the schema is
  the single source of truth, which removes drift between entities and the DB.
  The cost is a generated client that must be regenerated after schema changes
  (handled by `postinstall` and `npm run db:migrate`), and less raw-SQL control
  in application code (raw SQL is confined to migrations).

### 5.4 Zod for validation

Zod parses every request part in the `validate` middleware
(`src/shared/middleware/validate.ts:23`) and is also re-used in services
(`request.service.ts:60`, `comment.service.ts:25`) so rules are enforced even
when a service is invoked outside HTTP.

- Trade-off: validation is duplicated between route middleware and service
  layers, but that is deliberate defense in depth (see
  [Section 7](#7-security-model)). Zod also derives TS types via `z.infer`,
  keeping schemas and types in one place.

### 5.5 Pino for logging

Structured JSON logs via Pino; `pino-http` handles access logging, correlation
IDs (`x-request-id`), and redaction of `Authorization` headers
(`src/shared/utils/logger.ts:16`). Pretty-printing is enabled only in
development; tests are silent.

- Trade-off: JSON logs are less human-friendly than text, but they are
  machine-parseable for operators and cheap to filter by `correlationId`.

### 5.6 Synchronous activity logging

Activity rows are written inside the same database transaction as the state
change they describe (`request.service.ts:67`, `comment.service.ts:33`,
`decision.service.ts:61`).

- Trade-off: this makes the audit trail perfectly consistent with the state
  change (no window where a request moved but no activity exists), at the cost
  of keeping the transaction open slightly longer. Asynchronous queueing would
  reduce write latency but introduces at-least-once delivery and out-of-order
  risk, which the TRD explicitly does not need (no async processing).

### 5.7 Transaction + duplicate-decision prevention

See [Section 6.1](#61-decision-transaction-boundaries).

### 5.8 Offset pagination

Listing uses `page`/`pageSize` with `skip`/`take`, a parallel `count`, and a
`pageSize` cap of 100 (`src/shared/validators/pagination.ts:5`,
`src/modules/request/request.repository.ts:22`).

- Trade-off: offset pagination is simple, stable, and matches the TRD's list
  semantics, but deep offsets degrade on very large tables because PostgreSQL
  must scan and discard `skip` rows. Keyset pagination would scale better for
  huge datasets but adds cursor complexity that this single-service workload
  does not warrant (see [Section 8](#8-performance-and-scalability)).

---

## 6. Data Consistency

### 6.1 Decision transaction boundaries

A decision is one atomic unit:

```text
prisma.$transaction (decision.service.ts:61)
  ├─ fresh read of the request inside the transaction
  ├─ status-mismatch check   (concurrent duplicate -> 409 Conflict)
  ├─ guarded status update   (updateMany WHERE status = fromStatus)
  ├─ affected == 0           (no-op update -> 409 Conflict)
  └─ activityService.recordDecision (same transaction, append-only row)
```

The same shape applies to resubmission (`decision.service.ts:132`), request
creation (`request.service.ts:67`), and comments (`comment.service.ts:33`).
There is no partial state: if any step fails, the whole transaction rolls back.

### 6.2 Concurrent-update handling (duplicate decisions)

Duplicate decisions are prevented with an optimistic guard, not a lock. The
repository exposes `updateStatusGuarded`
(`src/modules/decision/decision.repository.ts:11`):

```ts
client.request.updateMany({
  where: { id, status: fromStatus },
  data: { status: toStatus },
});
```

Because the `WHERE` clause pins the current status, two concurrent decisions on
the same SUBMITTED request cannot both win: the first `updateMany` matches one
row; the second matches zero and its `affected === 0` becomes a
`ConflictError` (409) with `SYS_MSG.DUPLICATE_DECISION`.

The service distinguishes two failure classes:

- A sequential invalid transition (request already decided before this call) is
  a 400 `BAD_REQUEST` from the pre-transaction `validateTransition` check
  (`decision.service.ts:53`).
- A concurrent duplicate (request moved while this call was in flight) is a 409
  `CONFLICT`. The pre-transaction snapshot is only used to classify the error;
  the authoritative check is the fresh read and guarded update inside the
  transaction (`decision.service.ts:62-90`), so the two can never race with a
  stale snapshot.

### 6.3 Append-only activity guarantee

- The activity repository exposes no update or delete operations
  (`src/modules/activity/activity.repository.ts`), so application code cannot
  rewrite history.
- Every mutation path (create, decide, resubmit, comment) writes its activity in
  the same transaction, so the trail is complete and ordered by `created_at`.
- Deleting a request cascades to its activities and comments; deleting a
  reviewer nulls `activity.reviewer_id` but is blocked for comments
  (`schema.prisma:62`, `schema.prisma:79`).

### 6.4 Idempotency

Decisions are not idempotent in the "replay returns 200" sense: a second
decision on an already-decided request is rejected with 409/400. The intent,
per the TRD, is duplicate prevention (a repeat request must not silently
double-apply), and the stable `CONFLICT` code plus `errors.request_id` lets a
client detect the replay and read the actual state. This is documented as a
known limit in [Section 8](#8-performance-and-scalability).

---

## 7. Security Model

### 7.1 Header-based reviewer authentication

Authentication is mocked per the TRD: the `Authorization: Bearer <uuid>` header
carries a reviewer id. `requireReviewer`
(`src/modules/reviewer/reviewer.middleware.ts:9`) validates the header shape,
resolves the reviewer row, and attaches `req.reviewer` (typed via
`src/shared/types/express.d.ts`).

### 7.2 Authorization (reviewers only)

- Decisions (`approve`, `reject`, `return`) and comments are guarded by
  `requireReviewer` (`decision.routes.ts:17`, `comment.routes.ts:14`).
- `resubmit` is deliberately public: it is the requester responding to a
  return, not a reviewer decision (`decision.routes.ts:34`).
- The reviewer role field is stored and returned but no role hierarchy is
  enforced; any seeded reviewer may decide, which matches the TRD's simple
  reviewer permission model.

### 7.3 Validation at every layer

- Zod parses params, body, and query at the route boundary
  (`validate.ts`), including a UUID check on `:id` so malformed ids fail fast as
  422 instead of reaching the DB (`request.schema.ts:23`).
- Services re-validate business payloads (`request.service.ts:60`,
  `comment.service.ts:25`) and the decision service validates transitions.
- Database constraints (FKs, unique email, enum columns) are the last line of
  defense, and Prisma constraint errors are folded into the typed error
  hierarchy (`error-handler.ts:44`).

### 7.4 Safe error messages

- Errors carry stable codes (`src/shared/constants/error-codes.ts`) and
  messages from `SYS_MSG` (`src/shared/constants/system.messages.ts`); raw
  Prisma messages, SQL, and stack traces are logged server-side but never sent
  to clients (`error-handler.ts:97`). All 5xx return the generic
  `SYS_MSG.INTERNAL_SERVER_ERROR`.
- The health readiness probe never leaks connection details
  (`src/modules/health/health.repository.ts`).

### 7.5 Secret handling

- All environment variables are declared and validated in
  `src/config/env.ts` (Zod schema), which fails fast at boot on missing or
  malformed config. No code reads `process.env` directly outside that file.
- `.env` is gitignored; `.env.example` documents the variables. `DATABASE_URL`
  is required outside tests (a throwaway default exists under `NODE_ENV=test`
  so unit tests need no secrets).
- Pino redacts `Authorization` and cookie headers from all logs
  (`logger.ts:16`).
- Additional HTTP hardening: `helmet`, CORS, per-IP rate limiting, a request
  timeout, and a bounded JSON body size (`src/app.ts:24-29`).

---

## 8. Performance and Scalability

### 8.1 Indexes

- `request` -> `@@index([status])`: backs the list filter and the decision
  status guard lookups (`schema.prisma:51`).
- `comment` -> `@@index([request_id])` and `@@index([reviewer_id])`: back the
  per-request comment reads and the reviewer lookups (`schema.prisma:64`).
- `activity` -> `@@index([request_id])` and `@@index([reviewer_id])`: back the
  append-only history reads and reviewer lookups (`schema.prisma:81`).
- `reviewer.email` is unique and indexed (`schema.prisma:29`).

### 8.2 Pagination

Offset pagination with `page`/`pageSize` (max 100), ordering by `created_at
desc`, and a parallel `count` for `total`/`totalPages`
(`request.service.ts:90-105`). The count and page queries run concurrently via
`Promise.all`.

### 8.3 Known bottlenecks and limits

- Deep offset pagination degrades on very large request tables (PostgreSQL
  scans and discards `skip` rows). Accepted for this scope; keyset pagination is
  the documented upgrade path if the dataset grows.
- `findById` includes all comments and activities for a request
  (`request.repository.ts:39-46`); a request with a very long history returns a
  large payload. No pagination exists on the nested history endpoints.
- Decisions are duplicate-prevented but not idempotent-replayable: identical
  repeat requests return 409 rather than a replay-safe 200. Clients must treat
  `CONFLICT` as "already decided" and re-fetch.
- Single service, single PostgreSQL instance, in-process rate limiter (per
  instance), no async workers. Horizontal scaling would require externalizing
  rate limiting and reconsidering the synchronous activity writes.
- `Promise.all` on count + page keeps listing responsive, but the health
  readiness probe (`SELECT 1`) is the only DB-touching operational path by
  design.

---

## 9. Source File Map

| Concern                         | File                                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------ |
| App assembly / middleware order | [src/app.ts](src/app.ts)                                                                   |
| Boot + graceful shutdown        | [src/server.ts](src/server.ts)                                                             |
| Environment config              | [src/config/env.ts](src/config/env.ts)                                                     |
| Prisma schema                   | [src/database/schema.prisma](src/database/schema.prisma)                                   |
| Prisma client + adapter         | [src/database/index.ts](src/database/index.ts)                                             |
| Route aggregation               | [src/routes/index.ts](src/routes/index.ts)                                                 |
| Request module                  | [src/modules/request/](src/modules/request/)                                               |
| Decision module (state machine) | [src/modules/decision/](src/modules/decision/)                                             |
| Comment module                  | [src/modules/comment/](src/modules/comment/)                                               |
| Activity module (append-only)   | [src/modules/activity/](src/modules/activity/)                                             |
| Reviewer auth middleware        | [src/modules/reviewer/reviewer.middleware.ts](src/modules/reviewer/reviewer.middleware.ts) |
| Health module                   | [src/modules/health/](src/modules/health/)                                                 |
| Validation middleware           | [src/shared/middleware/validate.ts](src/shared/middleware/validate.ts)                     |
| Error handler                   | [src/shared/middleware/error-handler.ts](src/shared/middleware/error-handler.ts)           |
| Response envelope               | [src/shared/utils/response.ts](src/shared/utils/response.ts)                               |
| Logger + correlation ids        | [src/shared/utils/logger.ts](src/shared/utils/logger.ts)                                   |
