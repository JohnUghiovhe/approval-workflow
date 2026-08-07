# syntax=docker/dockerfile:1

# deps: install the full dependency set (dev tooling included) and generate the
# Prisma client. `npm ci` runs postinstall -> prisma generate, which reads
# prisma.config.ts and needs a resolvable DATABASE_URL; a placeholder is safe
# here because generate never connects to the database.
FROM node:22-alpine AS deps
WORKDIR /app

ENV DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder?schema=public

COPY package.json package-lock.json ./
COPY prisma.config.ts ./
COPY src/database/schema.prisma src/database/schema.prisma
RUN npm ci && npx prisma generate

# build: compile the TypeScript sources, including the generated client that
# npm ci created under src/generated, to dist/.
FROM deps AS build
WORKDIR /app

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# prod: minimal runtime image. Installs production dependencies only and skips
# the postinstall generate because the compiled client already ships inside
# dist/. Runs as the non-root `node` user. prisma.config.ts, the schema, and
# the migrations stay in the image so `prisma migrate deploy` can be run from
# the container against a fresh database.
FROM node:22-alpine AS prod
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node prisma.config.ts ./
COPY --chown=node:node src/database/schema.prisma src/database/schema.prisma
COPY --chown=node:node src/database/migrations src/database/migrations
# The OpenAPI spec is read from disk at startup by src/config/openapi.ts, so it
# must ship alongside the compiled routes.
COPY --chown=node:node docs/openapi.yaml docs/openapi.yaml

# `npm ci --ignore-scripts` skips the @prisma/engines postinstall that downloads
# the schema engine. Without it the first `prisma migrate` run would try to
# write the engine into node_modules, which the non-root `node` user cannot do.
# Generating here (as root, during the build) downloads the engine read-only;
# the generated client is not needed at runtime because dist/ already carries
# the compiled copy, so it is removed again to keep the image lean.
RUN DATABASE_URL='postgresql://placeholder:placeholder@localhost:5432/placeholder' npx prisma generate \
  && rm -rf src/generated

USER node

EXPOSE 3000

# Healthcheck the liveness endpoint with Node's built-in fetch so the probe
# needs no extra package in the alpine image.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))"]

CMD ["node", "dist/server.js"]
