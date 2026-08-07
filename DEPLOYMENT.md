# Deployment

This guide covers deploying the Approval Workflow Service with Docker. It
assumes a host with Docker Engine and Docker Compose v2 installed. For local
development setup, see [README.md](README.md); for the internal design, see
[ARCHITECTURE.md](ARCHITECTURE.md).

## Stack Overview

```text
┌────────────────────────────┐      ┌─────────────────────────────┐
│  app  (node:22-alpine)     │      │  postgres (postgres:16)     │
│  - dist/server.js          │─────►│  - approval_workflow DB     │
│  - prisma CLI + schema     │      │  - postgres_data volume     │
│  - non-root `node` user    │      │  - healthcheck              │
└────────────────────────────┘      └─────────────────────────────┘
```

The `app` service is built from the multi-stage `Dockerfile`:

1. `deps` installs all dependencies and runs `prisma generate`.
2. `build` compiles the TypeScript sources to `dist/`.
3. `prod` installs production dependencies only, copies the compiled app, the
   Prisma schema, the migrations, and the OpenAPI spec, then runs
   `node dist/server.js` as the non-root `node` user.

The image ships the `prisma` CLI (it is a runtime dependency, see
`package.json`) plus `src/database/schema.prisma` and
`src/database/migrations/`, so schema migrations can be applied from inside the
container against any database the `DATABASE_URL` points at.

## Building the Image

```sh
docker compose build
```

This builds `approval-workflow-service:latest`. The runtime image runs as
`uid=1000(node)` (never root); verify with:

## Environment Variables

| Variable               | Description                                                       | Compose default                                                                |
| ---------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `NODE_ENV`             | Runtime mode; the image sets `production`                         | `production` (set in the image)                                                |
| `PORT`                 | Port the server binds to in the container                         | `3000`                                                                         |
| `DATABASE_URL`         | PostgreSQL connection string (host `postgres` inside the network) | `postgresql://approval:approval@postgres:5432/approval_workflow?schema=public` |
| `LOG_LEVEL`            | Pino level (optional; defaults to `info`)                         | (unset)                                                                        |
| `RATE_LIMIT_MAX`       | Requests per client IP within the window                          | `100` (runtime default)                                                        |
| `RATE_LIMIT_WINDOW_MS` | Rate-limit window length                                          | `900000` (runtime default)                                                     |
| `REQUEST_TIMEOUT_MS`   | In-flight request timeout                                         | `30000` (runtime default)                                                      |
| `JSON_BODY_LIMIT`      | Maximum accepted JSON body size                                   | `100kb` (runtime default)                                                      |
| `TRUST_PROXY`          | Trusted reverse-proxy hops (see [Reverse Proxy](#reverse-proxy))  | `0` (runtime default)                                                          |

All variables are validated by the Zod schema in `src/config/env.ts`; the
process fails fast at boot on missing or malformed configuration. Only
`DATABASE_URL` is strictly required at runtime (the others fall back to
sensible defaults).

## Running the Stack

```sh
docker compose up -d --wait
```

Compose starts `postgres` first (it is declared as a dependency with
`condition: service_healthy`), then the `app` container; `--wait` blocks until
both are healthy. Both expose healthchecks. Wait for the app to become
healthy:

```sh
docker compose ps
# approval-workflow-app   Up (healthy)   0.0.0.0:3000->3000/tcp
```

Verify the liveness probe and a real API call:

```sh
curl http://localhost:3000/health
# {"statusCode":200,...,"data":{"status":"ok",...}}

curl http://localhost:3000/api/requests
```

The API is reachable at `http://localhost:3000/api` and Swagger UI at
`http://localhost:3000/api/docs`.

## Initializing a Fresh Database

The Postgres container starts with an empty database. Apply the schema
migrations and seed data before relying on the API. Migrations run inside the
container (the image includes the `prisma` CLI and the migrations); the seed
runs from the host because it needs the `tsx` dev tooling.

### 1. Apply migrations

```sh
docker compose exec app npx prisma migrate deploy
```

This applies every migration in `src/database/migrations/` (in the image at
`/app/src/database/migrations/`) to the database named by `DATABASE_URL`. It is
idempotent: re-running it on an up-to-date schema is a no-op.

### 2. Seed data (one time)

Seed from the host against the compose Postgres. Point a terminal at the repo
root and run:

```sh
DATABASE_URL="postgresql://approval:approval@localhost:5432/approval_workflow?schema=public" \
  npm run db:seed
```

Windows PowerShell equivalent:

```powershell
$env:DATABASE_URL = "postgresql://approval:approval@localhost:5432/approval_workflow?schema=public"
npm run db:seed
Remove-Item Env:DATABASE_URL
```

The seed is idempotent (it upserts reviewers by email and only adds missing
activity history), so it is safe to re-run.

### 3. Confirm readiness

```sh
curl http://localhost:3000/health/ready
# {"statusCode":200,...,"checks":{"database":"up"}}
```

Once the database reports `up`, the `/api` endpoints (create, list, decide,
comment, activities) are fully functional.

## Reverse Proxy

Run the service behind an HTTP reverse proxy (nginx, Caddy, a cloud load
balancer) rather than exposing the container port directly. Two things matter:

- Set `TRUST_PROXY` to the number of proxy hops in front of the app so the
  per-IP rate limiter sees the real client address instead of the proxy's.
  Behind a single reverse proxy, `TRUST_PROXY=1`.
- If the proxy terminates TLS, keep it HTTP-to-HTTP between proxy and app; the
  service is a plain HTTP server and has no TLS options of its own.

Example nginx location block:

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Swagger UI's spec uses a relative server URL, so it targets whichever origin
serves the UI through the proxy.

## Production Volumes

- **Database**: the compose file attaches the `postgres_data` named volume to
  `postgres:/var/lib/postgresql/data`. This volume is the only durable state;
  do not delete it unless you intend to wipe data. Back it up (e.g. `pg_dump`)
- **Database**: the compose file attaches the `postgres_data` named volume to
  `postgres_data:/var/lib/postgresql/data`. This volume is the only durable state;
  do not delete it unless you intend to wipe data. Back it up (e.g. `pg_dump`)
  before upgrades.

## Secrets Guidance

- Never commit `.env`; it is gitignored and excluded from the Docker build
  context via `.dockerignore`. `.env.example` documents the expected keys.
- Pass runtime secrets (at minimum `DATABASE_URL`) through the Compose
  `environment:` block or a Docker secrets/`env_file` mechanism, not baked into
  the image. The Dockerfile intentionally does not copy `.env`.
- Pino redacts `Authorization` and cookie headers from all log output, so
  reviewer tokens never appear in structured logs.
- The image runs as a non-root user as a defense-in-depth measure; do not
  re-introduce `USER root` or privileged flags without a strong reason.
- Rotation: because reviewer auth is a bearer UUID, revoke a reviewer by
  disabling them, not by deleting the row. Set `is_active = false` on the
  reviewer record (e.g. `UPDATE reviewer SET is_active = false WHERE id =
'<uuid>';`); authentication rejects disabled reviewers, and the flag keeps
  their comments (`Restrict` would block a row delete) and activity history
  (`SetNull`) intact, so revocation stays possible after a reviewer has
  commented.

## Upgrading an Existing Deployment

1. Back up the database volume.
2. Rebuild and restart: `docker compose up -d --build --wait`.
3. Apply new migrations: `docker compose exec app npx prisma migrate deploy`.
4. Verify readiness with `/health/ready` and run the smoke call
   (`GET /api/requests`).

The healthchecks keep orchestration informed during the roll: liveness is
app-only (does not touch the database), readiness reports the database state.

## Troubleshooting

| Symptom                                      | Likely cause                                 | Fix                                                               |
| -------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------- |
| `app` container restarting at boot           | `docs/openapi.yaml` missing from the image   | Rebuild; the Dockerfile copies it into `/app/docs/`               |
| `prisma migrate deploy` cannot write engine  | Engine was not downloaded during the build   | Rebuild; the prod stage runs `prisma generate` at build time      |
| `/health/ready` reports `degraded`           | `DATABASE_URL` wrong or Postgres unreachable | Check the Compose `DATABASE_URL` hostname and `docker compose ps` |
| API returns 500 on first requests            | Migrations not yet applied                   | Run `docker compose exec app npx prisma migrate deploy`           |
| Rate limiting counts proxy IPs as one client | `TRUST_PROXY` not set behind a reverse proxy | Set `TRUST_PROXY` to the hop count                                |

## Verification Checklist

- [ ] `docker compose build` succeeds and the image runs as `uid=1000(node)`
- [ ] `docker compose up -d` starts `app` + `postgres`; `/health` returns 200
- [ ] Fresh database: `prisma migrate deploy` applies all migrations
- [ ] `npm run db:seed` seeds reviewers and requests (idempotent)
- [ ] `/health/ready` reports `database: up`
- [ ] `GET /api/requests` returns 200; a create/approve round-trip succeeds
