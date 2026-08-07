# Approval Workflow Service - API Reference & Data Design

Detailed API contracts, validation rules, error responses, the persistence
model, and setup/migration instructions. For the quick start, environment
variables, and operational notes see the [README](../README.md); for the
implementation deep-dive (state machine, layering, concurrency) see
[ARCHITECTURE.md](../ARCHITECTURE.md).

The machine-readable OpenAPI spec is served by Swagger UI at
`http://localhost:3000/api/docs` and its source of truth lives in
[docs/openapi.yaml](openapi.yaml).

## 1. Conventions

- Base URL: the server listens on `http://localhost:3000` by default (`PORT`).
- Request and response bodies are JSON (`Content-Type: application/json`).
- All timestamps are ISO 8601 UTC (stored as `Timestamptz(3)`).
- API fields are camelCase; database columns are snake_case. Services map
  between the two (the `toRequestDto`/`toCommentDto`/`toActivityDto` helpers).
  Business-error detail keys inside the `errors` envelope are the one deliberate
  exception: they are snake_case to mirror the database columns they identify
  (for example `request_id`, `current_status`, `attempted_decision`). Validation
  failure entries keep camelCase `field` names.
- Authentication is mocked: send a reviewer's UUID as a bearer token
  (`Authorization: Bearer <reviewer-uuid>`) on reviewer-only endpoints. The
  token is looked up as the reviewer primary key; there is no signing, expiry,
  or refresh. Request create/list/view, resubmit, and activities are public.

### Success envelope

```json
{
  "statusCode": 200,
  "message": "Operation completed successfully",
  "data": {}
}
```

`statusCode` and `message` are consistent across successes; `data` carries the
endpoint-specific payload.

### Error envelope

```json
{
  "statusCode": 409,
  "message": "A decision has already been recorded for this request",
  "code": "CONFLICT",
  "requestId": "9f8e1d4c-2b3a-4c5d-8e6f-1a2b3c4d5e6f",
  "errors": { "request_id": "050de558-2ec7-401f-8bc3-911ebecb6202", "decision": "approve" }
}
```

`code` is a stable machine-readable identifier clients can branch on.
`requestId` is the correlation id. `errors` is an array of `{ field, message }`
entries for validation failures, or an object of business-error details. Its
object keys are snake_case (for example `request_id`, `current_status`,
`attempted_decision`), a deliberate exception to the camelCase API convention;
see [Error Responses](#4-error-responses) for the full catalog.

### Pagination

Lists use offset pagination via the query params `page` (1-based, default 1)
and `pageSize` (1 to 100, default 10).

## 2. Endpoints

| Method | Path                           | Auth     | Purpose                                           |
| ------ | ------------------------------ | -------- | ------------------------------------------------- |
| GET    | `/health`                      | public   | Liveness probe (never touches the database)       |
| GET    | `/health/ready`                | public   | Readiness probe (reports database state)          |
| POST   | `/api/requests`                | public   | Create a request                                  |
| GET    | `/api/requests`                | public   | List requests (paginated, optional status filter) |
| GET    | `/api/requests/:id`            | public   | View one request with comments and activities     |
| POST   | `/api/requests/:id/approve`    | reviewer | Approve a submitted request                       |
| POST   | `/api/requests/:id/reject`     | reviewer | Reject a submitted request                        |
| POST   | `/api/requests/:id/return`     | reviewer | Return a submitted request for correction         |
| POST   | `/api/requests/:id/resubmit`   | public   | Resubmit a returned request                       |
| POST   | `/api/requests/:id/comments`   | reviewer | Attach a comment to a request                     |
| GET    | `/api/requests/:id/activities` | public   | Append-only audit trail for a request             |
| GET    | `/api/docs`                    | public   | Swagger UI (interactive docs)                     |
| GET    | `/api/docs/openapi.json`       | public   | Machine-readable OpenAPI document                 |

`:id` must be a UUID; anything else is a `422` validation error before the
database is consulted.

### 2.1 Health

`GET /health` always returns `200` with an app-only report (`status: "ok"`, no
database check) so orchestration can restart a hung process even when the
database is down.

`GET /health/ready` returns `200` with `status: "healthy"` when the database
answers `SELECT 1`, and `503` with `status: "degraded"` otherwise. The report
never leaks the database URL or connection details.

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

### 2.2 Create a request

`POST /api/requests`

| Field           | Type   | Required | Notes                               |
| --------------- | ------ | -------- | ----------------------------------- |
| `title`         | string | yes      | at least 1 character                |
| `description`   | string | no       | stored as empty string when omitted |
| `department`    | string | yes      | at least 1 character                |
| `requesterName` | string | yes      | at least 1 character                |

Creates the request in `SUBMITTED` and records its `SUBMISSION` activity in the
same transaction. Responds `201` with the request; the `comments` and
`activities` relations are intentionally returned empty because create and list
responses do not load them, so the recorded `SUBMISSION` row is not echoed here.
Fetch `GET /api/requests/:id` to read the history (see [View a request](#24-view-a-request)).

### 2.3 List requests

`GET /api/requests`

Query params: `page`, `pageSize`, and `status` (one of `SUBMITTED`,
`APPROVED`, `REJECTED`, `RETURNED`). Responds `200` with a paginated payload:

```json
{
  "statusCode": 200,
  "message": "Operation completed successfully",
  "data": {
    "data": [],
    "page": 1,
    "pageSize": 10,
    "total": 0,
    "totalPages": 0
  }
}
```

### 2.4 View a request

`GET /api/requests/:id`

Responds `200` with the request including its `comments` and `activities`
history, or `404` when the id does not exist.

### 2.5 Decisions

`POST /api/requests/:id/approve` takes no body.

`POST /api/requests/:id/reject` and `POST /api/requests/:id/return` accept an
optional `notes` string explaining the outcome.

`POST /api/requests/:id/resubmit` requires a `requesterName` (at least 1
character); it is the requester responding to a return, so it is public.

All decision routes respond `200` with a decision payload: the full request
object plus `decision`, `reviewerId`, and `decidedAt`. `reviewerId` is `null`
for resubmissions because the requester performs them.

The valid transitions are enforced by the state machine:

| Current state | Action   | Next state | Notes                         |
| ------------- | -------- | ---------- | ----------------------------- |
| SUBMITTED     | approve  | APPROVED   | terminal                      |
| SUBMITTED     | reject   | REJECTED   | terminal                      |
| SUBMITTED     | return   | RETURNED   |                               |
| RETURNED      | resubmit | SUBMITTED  | requester fixes and resubmits |

There is no `IN_REVIEW` state; APPROVED and REJECTED are terminal. A decision
that does not match the table returns `400 BAD_REQUEST`. When two decisions race
for the same request, exactly one succeeds with `200`. A call that observes the
already-terminal state (for example a sequential repeat after the winner
committed) returns `400 BAD_REQUEST`; a call that passed the initial check but
loses the guarded status update (a truly concurrent duplicate) returns
`409 CONFLICT`.

### 2.6 Add a comment

`POST /api/requests/:id/comments`

Reviewer-only. Body: `{ "body": "..." }` (`body` required, at least 1
character). Attaches the comment and records a `COMMENT` activity row in the
same transaction. Responds `201` with the created comment.

### 2.7 List activity history

`GET /api/requests/:id/activities`

Responds `200` with the request's activities in creation order. The history is
append-only: the repository exposes only `create`, `createMany`, and
`listByRequestId` - never update or delete.

## 3. Validation

All request parts (body, query, params) are parsed with Zod in the shared
`validate` middleware before reaching controllers.

- `createRequestSchema`: `title` (string, min 1), `description` (optional
  string), `department` (string, min 1), `requesterName` (string, min 1).
- `listRequestsQuerySchema`: `page` (integer, min 1), `pageSize` (integer, min
  1, max 100), `status` (enum, optional).
- `requestIdParamsSchema`: `id` must be a UUID.
- `DecisionBodySchema` (reject/return): `notes` (optional string).
- `ResubmitSchema`: `requesterName` (string, min 1).
- `AddCommentSchema`: `body` (string, min 1).

A failed parse produces `422 VALIDATION_ERROR` with one `{ field, message }`
entry per offending field.

## 4. Error Responses

Errors always use the shared envelope with a stable `code`. The registry lives
in `src/shared/constants/error-codes.ts`:

| Code                | Meaning                                 | HTTP status |
| ------------------- | --------------------------------------- | ----------- |
| `PAYLOAD_TOO_LARGE` | Body exceeds the configured JSON limit  | 413         |
| `BAD_REQUEST`       | Malformed request or invalid transition | 400         |
| `UNAUTHORIZED`      | Missing/invalid authorization           | 401         |
| `NOT_FOUND`         | Resource not found                      | 404         |
| `CONFLICT`          | State conflict or duplicate decision    | 409         |
| `VALIDATION_ERROR`  | Zod validation failed                   | 422         |
| `TOO_MANY_REQUESTS` | Client exceeded the rate limit          | 429         |
| `REQUEST_TIMEOUT`   | Request exceeded the timeout            | 408         |
| `DB_ERROR`          | Unmapped database failure               | 500         |
| `INTERNAL`          | Unhandled internal error                | 500         |

Error mapping:

- Malformed JSON bodies rejected by the body parser become `400 BAD_REQUEST`.
- Prisma unique violation (`P2002`) becomes `409 CONFLICT`.
- Prisma missing record (`P2025`) becomes `404 NOT_FOUND`.
- Prisma foreign key violation (`P2003`) becomes `422 VALIDATION_ERROR`.
- Any other Prisma error becomes `500 DB_ERROR`.
- Unhandled exceptions become `500 INTERNAL` with
  `SYS_MSG.INTERNAL_SERVER_ERROR`; raw Prisma messages, SQL, and stack traces
  are logged but never sent to the client.

## 5. Walkthrough

This end-to-end walkthrough drives a request through its whole lifecycle with
`curl` against `npm run dev` (http://localhost:3000): create, list, view,
decide, return, resubmit, comment, and activities. Reviewers are mocked, so the
bearer token is a reviewer UUID from the seed data - no passwords or JWTs
involved.

The examples assume bash or zsh on macOS/Linux, or PowerShell 7+ on Windows. On
Windows PowerShell 5.1 call `curl.exe` instead of `curl`; the JSON bodies use
single quotes, which both shells pass through literally.

### 1. Grab a reviewer token

Authentication is mocked: send a reviewer's UUID as a bearer token. Open
Prisma Studio and copy the `id` of any seeded reviewer:

```sh
npm run db:studio
```

Export it for the reviewer-only calls:

```sh
# bash / zsh
export REVIEWER="<reviewer-uuid>"
```

```powershell
# Windows PowerShell 7+
$env:REVIEWER = "<reviewer-uuid>"
```

### 2. Create a request

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

A request starts in `SUBMITTED`. Save its `data.id` for the next steps. Note
that `comments` and `activities` are empty here even though the `SUBMISSION`
row was recorded: create responses intentionally omit relations. The view step
below shows the full history.

### 3. List requests

```sh
curl -s http://localhost:3000/api/requests
```

Response `200` wraps the rows in a paginated payload:

```json
{
  "statusCode": 200,
  "message": "Operation completed successfully",
  "data": {
    "data": [
      {
        "id": "050de558-2ec7-401f-8bc3-911ebecb6202",
        "title": "Laptop upgrade for design team",
        "department": "Engineering",
        "requesterName": "Olu Smith",
        "status": "SUBMITTED",
        "createdAt": "2026-08-06T09:00:00.000Z",
        "updatedAt": "2026-08-06T09:00:00.000Z",
        "comments": [],
        "activities": []
      }
    ],
    "page": 1,
    "pageSize": 10,
    "total": 1,
    "totalPages": 1
  }
}
```

Pagination and a status filter combine in the query string:

```sh
curl -s "http://localhost:3000/api/requests?page=1&pageSize=5&status=SUBMITTED"
```

`page` starts at 1, `pageSize` maxes out at 100, and `status` accepts
`SUBMITTED`, `APPROVED`, `REJECTED`, or `RETURNED`.

### 4. View one request

```sh
curl -s http://localhost:3000/api/requests/050de558-2ec7-401f-8bc3-911ebecb6202
```

Response `200` includes the full activity history:

```json
{
  "statusCode": 200,
  "message": "Operation completed successfully",
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
    "activities": [
      {
        "id": "f00d90ac-5f6e-4d1f-8f90-2a3b4c5d6e7f",
        "requestId": "050de558-2ec7-401f-8bc3-911ebecb6202",
        "reviewerId": null,
        "action": "SUBMISSION",
        "fromStatus": null,
        "toStatus": "SUBMITTED",
        "note": "Olu Smith",
        "createdAt": "2026-08-06T09:00:00.000Z"
      }
    ]
  }
}
```

### 5. Approve the request

Reviewer-only. Send the reviewer UUID from step 1 as the bearer token:

```sh
curl -s -X POST http://localhost:3000/api/requests/050de558-2ec7-401f-8bc3-911ebecb6202/approve \
  -H "Authorization: Bearer $REVIEWER"
```

Response `200` includes the decision fields:

```json
{
  "statusCode": 200,
  "message": "Operation completed successfully",
  "data": {
    "id": "050de558-2ec7-401f-8bc3-911ebecb6202",
    "title": "Laptop upgrade for design team",
    "description": "Replace aging laptops.",
    "department": "Engineering",
    "requesterName": "Olu Smith",
    "status": "APPROVED",
    "createdAt": "2026-08-06T09:00:00.000Z",
    "updatedAt": "2026-08-06T09:00:05.000Z",
    "comments": [],
    "activities": [
      {
        "id": "f00d90ac-5f6e-4d1f-8f90-2a3b4c5d6e7f",
        "requestId": "050de558-2ec7-401f-8bc3-911ebecb6202",
        "reviewerId": null,
        "action": "SUBMISSION",
        "fromStatus": null,
        "toStatus": "SUBMITTED",
        "note": "Olu Smith",
        "createdAt": "2026-08-06T09:00:00.000Z"
      },
      {
        "id": "7f88f2ce-f138-4a99-a055-d3cc2eb6101c",
        "requestId": "050de558-2ec7-401f-8bc3-911ebecb6202",
        "reviewerId": "d5321303-99dc-469d-90ad-f06b4e56a6b9",
        "action": "APPROVAL",
        "fromStatus": "SUBMITTED",
        "toStatus": "APPROVED",
        "note": null,
        "createdAt": "2026-08-06T09:00:05.000Z"
      }
    ],
    "decision": "approve",
    "reviewerId": "d5321303-99dc-469d-90ad-f06b4e56a6b9",
    "decidedAt": "2026-08-06T09:00:05.000Z"
  }
}
```

`reject` and `return` work the same way and accept an optional `notes` body so
the requester knows the outcome:

```sh
curl -s -X POST http://localhost:3000/api/requests/050de558-2ec7-401f-8bc3-911ebecb6202/return \
  -H "Authorization: Bearer $REVIEWER" \
  -H "Content-Type: application/json" \
  -d '{"notes":"Fix the budget line and resubmit."}'
```

### 6. Resubmit a returned request

`return` moves the request to `RETURNED`. The requester fixes it and resubmits
with their name (public endpoint, no bearer token):

```sh
curl -s -X POST http://localhost:3000/api/requests/050de558-2ec7-401f-8bc3-911ebecb6202/resubmit \
  -H "Content-Type: application/json" \
  -d '{"requesterName":"Olu Smith"}'
```

Response `200` returns the request back in `SUBMITTED` with a `RESUBMISSION`
activity and `reviewerId: null`.

### 7. Leave a comment

```sh
curl -s -X POST http://localhost:3000/api/requests/050de558-2ec7-401f-8bc3-911ebecb6202/comments \
  -H "Authorization: Bearer $REVIEWER" \
  -H "Content-Type: application/json" \
  -d '{"body":"Looks good, approved."}'
```

Response `201` echoes the created comment with the reviewer's id and timestamp.

### 8. Inspect the activity history

```sh
curl -s http://localhost:3000/api/requests/050de558-2ec7-401f-8bc3-911ebecb6202/activities
```

Response `200` lists every action chronologically (`SUBMISSION`, `APPROVAL`,
`RETURN`, `RESUBMISSION`, `COMMENT`), each with the acting reviewer, the from/to
statuses, and a note. The history is append-only: it is never rewritten or
deleted.

### Error cases worth knowing

A missing or invalid bearer token on a reviewer-only route returns `401`:

```sh
curl -s -X POST http://localhost:3000/api/requests/050de558-2ec7-401f-8bc3-911ebecb6202/approve
```

```json
{
  "statusCode": 401,
  "message": "Missing or invalid authorization header",
  "code": "UNAUTHORIZED",
  "requestId": "9c792ae8-0d06-4d11-af1e-8d8ca427c715"
}
```

An unknown request id returns `404`:

```sh
curl -s http://localhost:3000/api/requests/00000000-0000-0000-0000-000000000000
```

```json
{
  "statusCode": 404,
  "message": "Request not found",
  "code": "NOT_FOUND",
  "requestId": "bd7b7b5f-0fdf-4284-aa41-845a856319e5",
  "errors": { "request_id": "00000000-0000-0000-0000-000000000000" }
}
```

An invalid payload returns `422` with one entry per offending field:

```sh
curl -s -X POST http://localhost:3000/api/requests \
  -H "Content-Type: application/json" \
  -d '{"title":""}'
```

```json
{
  "statusCode": 422,
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "requestId": "ac7f71d6-3c7a-4ea4-89d4-6d14f89ba504",
  "errors": [
    { "field": "title", "message": "Too small: expected string to have >=1 characters" },
    { "field": "department", "message": "Invalid input: expected string, received undefined" },
    { "field": "requesterName", "message": "Invalid input: expected string, received undefined" }
  ]
}
```

Decisions that violate the transition table return `400 BAD_REQUEST`:

```sh
curl -s -X POST http://localhost:3000/api/requests/050de558-2ec7-401f-8bc3-911ebecb6202/approve \
  -H "Authorization: Bearer $REVIEWER"
```

after the request was already approved, responds:

```json
{
  "statusCode": 400,
  "message": "Request cannot transition to the requested state",
  "code": "BAD_REQUEST",
  "requestId": "9e103d30-6990-4884-b48b-a5a53ad8777a",
  "errors": {
    "request_id": "050de558-2ec7-401f-8bc3-911ebecb6202",
    "current_status": "APPROVED",
    "attempted_decision": "approve"
  }
}
```

Duplicate decisions are only reachable when two requests race: fire several
approvals at once and exactly one wins with `200` while the concurrent losers
get `409` (`CONFLICT`, "A decision has already been recorded for this request").
A caller that starts after the winner already committed sees the terminal state
and gets `400` instead:

```sh
curl -s -X POST http://localhost:3000/api/requests/050de558-2ec7-401f-8bc3-911ebecb6202/approve \
  -H "Authorization: Bearer $REVIEWER" &
curl -s -X POST http://localhost:3000/api/requests/050de558-2ec7-401f-8bc3-911ebecb6202/approve \
  -H "Authorization: Bearer $REVIEWER" &
curl -s -X POST http://localhost:3000/api/requests/050de558-2ec7-401f-8bc3-911ebecb6202/approve \
  -H "Authorization: Bearer $REVIEWER" &
wait
```

```json
{
  "statusCode": 409,
  "message": "A decision has already been recorded for this request",
  "code": "CONFLICT",
  "requestId": "a5bdf5fc-79f6-4233-a611-c070c51ed18f",
  "errors": { "request_id": "050de558-2ec7-401f-8bc3-911ebecb6202", "decision": "approve" }
}
```

The `408` timeout status fires only when a route exceeds `REQUEST_TIMEOUT_MS`
(30 s by default), which is impractical to trigger with a plain `curl` call.

## 6. Persistence Model

Four tables in a single PostgreSQL database (see
[src/database/schema.prisma](../src/database/schema.prisma) for the schema):

- **reviewer** - the people who decide and comment. `id` (UUID pk), `name`,
  `email` (unique), `role` (default `"reviewer"`; stored but not enforced as
  RBAC), timestamps.
- **request** - one lifecycle per departmental request. `id` (UUID pk),
  `title`, `description`, `department`, `requester_name`, `status`
  (`request_status` enum, default `SUBMITTED`), timestamps. Indexed on
  `status` because it drives the list filter and every decision query.
- **comment** - reviewer feedback attached to a request. `id`, `request_id`,
  `reviewer_id`, `body`, `created_at`. Indexed on both foreign keys;
  `onDelete: Cascade` for requests and `Restrict` for reviewers.
- **activity** - the append-only audit trail. `id`, `request_id`,
  `reviewer_id` (nullable), `action` (`activity_action` enum), `from_status`
  and `to_status` (nullable `request_status`), `note`, `created_at`. Indexed on
  both foreign keys; `onDelete: Cascade` for requests and `SetNull` for
  reviewers so deleting a reviewer preserves the audit trail.

Enums:

- `request_status`: `SUBMITTED`, `APPROVED`, `REJECTED`, `RETURNED`
- `activity_action`: `SUBMISSION`, `APPROVAL`, `REJECTION`, `RETURN`,
  `RESUBMISSION`, `COMMENT`

`activity.reviewer_id` is nullable because submission and resubmission are
requester actions, not reviewer actions. The activity table exposes no update
or delete paths, so the history cannot be rewritten.

## 7. Setup & Migrations

Full environment setup (Node, Docker, `.env`, running the server) is in the
[README](../README.md) under Getting Started. This section covers the database
and migration workflow.

```sh
npm install          # postinstall runs prisma generate
docker compose up -d --wait postgres
npm run db:migrate   # create/apply a Prisma migration
npm run db:seed      # idempotent reviewers + requests
```

- Migrations live in `src/database/migrations/` as reviewed SQL. Create one
  with `npm run db:migrate -- --name <name>`; always review the generated SQL
  in `src/database/migrations/`.
- Never edit a migration after it has been applied to a shared database.
- The generated Prisma client (`src/generated/`) is produced by
  `prisma generate` and is gitignored; `postinstall` and every migrate apply it.
- DB columns are snake_case; timestamps are `@db.Timestamptz(3)` (UTC).
- In production, apply migrations with `prisma migrate deploy` (see
  [DEPLOYMENT.md](../DEPLOYMENT.md) for the packaged container workflow).
