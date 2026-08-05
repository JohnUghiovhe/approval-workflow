# Phase 1 – Foundation & Setup Implementation Tickets

## Epic Goal
Establish the project foundation, tooling, database schema, validation layer, and shared infrastructure.

## Ticket 1.1 – Initialize Backend Project
- Initialize Node.js project
- Configure TypeScript
- Install Express 5, dotenv, tsx
- Configure scripts: dev, build, start, lint, format, test, db:migrate, db:seed, db:studio
**Acceptance:** Server boots, TS compiles, env loads.

## Ticket 1.2 – Configure Code Quality
- ESLint
- Prettier
- Husky
- lint-staged

## Ticket 1.3 – Configure Folder Structure

```text
approval-workflow-service/

├── src/   
│   ├── app.ts
│   ├── server.ts
│   ├── config/
│   ├── database/
│       ├── migrations/
│       ├── schema.prisma
│       └── seed.ts
│   ├── modules/
│   │   ├── request/
│   │   ├── reviewer/
│   │   ├── activity/
│   │   └── health/
│   ├── routes/
│   └── shared/
│       ├── constants/
│       ├── errors/
│       ├── middleware/
│       ├── types/
│       ├── utils/
│       └── validators/
├── tests/
├── docs/
├── docker/
├── .github/workflows/
├── docker-compose.yml
├── .env.example
├── package.json
└── README.md
```

Feature module template:
```text
request/
├── tests/
├── request.controller.ts
├── request.service.ts
├── request.repository.ts
├── request.routes.ts
├── request.schema.ts
└── request.types.ts
```

## Ticket 1.4 – Configure PostgreSQL & Prisma
- Configure Prisma
- Initial migration
- Generate client

## Ticket 1.5 – Seed Initial Data
- Seed reviewers
- Seed requests

## Ticket 1.6 – Validation Layer
- Zod schemas
- Validation middleware
- Error formatter

## Ticket 1.7 – Shared Infrastructure
- Custom errors
- Response helpers
- Logger
- Async wrapper
- Env loader

## Ticket 1.8 – Foundation Verification
- Server runs
- DB connected
- Migrations applied
- Seed works
- Validation passes
- Lint/tests runnable
