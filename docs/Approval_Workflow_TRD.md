# Technical Requirements Document (TRD)

## Project

**Peerless Backend Engineer Assessment -- Approval Workflow Service**

**Author:** John Ughiovhe\
**Version:** 1.0\
**Date:** 5 August 2026

---

# 1. Executive Summary

This document defines the functional and technical requirements for
implementing the **Approval Workflow Service** described in the Peerless
Backend Engineer Assessment. The goal is to deliver a dependable backend
service that models departmental approval requests, enforces valid
workflow transitions, maintains a complete audit trail, and exposes
predictable REST APIs. The implementation will prioritize correctness,
maintainability, and engineering communication over unnecessary
infrastructure.

---

# 2. Project Overview

## Background

An operations platform receives departmental requests that authorized
reviewers can approve, reject, or return for correction. Every decision
must follow valid state transitions and remain traceable.

## Objectives

- Build a dependable approval workflow API.
- Enforce business workflow integrity.
- Preserve an immutable audit history.
- Prevent duplicate decisions.
- Deliver clear API documentation and automated tests.

---

# 3. Functional Requirements

## FR-1 Request Management

- Submit request
- View request
- List requests

## FR-2 Decision Management

- Approve
- Reject
- Return for correction

## FR-3 Comments

- Add reviewer comments
- Retrieve request comments

## FR-4 Authorization

- Only reviewers can make decisions.

## FR-5 Audit Trail

- Record every significant action as append-only history.

---

# 4. Non-Functional Requirements

- Maintainable architecture
- Predictable API responses
- Structured logging
- Input validation
- Database consistency
- Automated tests
- Health endpoint
- OpenAPI documentation

---

# 5. Assumptions

- Authentication is mocked using request headers.
- Reviewers are pre-seeded.
- UTC timestamps are used.
- Synthetic data only.
- Single service deployment.

---

# 6. Constraints

- Local PostgreSQL database
- No external integrations
- No payment or notification services
- Focus on one complete workflow

---

# 7. Out of Scope

- Email notifications
- File uploads
- Workflow designer
- Admin dashboard
- Multi-tenancy
- Distributed services

---

# 8. Domain Model

Entities:

- Request
- Reviewer
- Comment
- Activity

Each request belongs to one lifecycle and has an append-only activity
history.

---

# 9. Business Rules

- New requests start as **Submitted**.
- Only authorized reviewers can decide.
- Approved requests cannot be modified.
- Rejected requests are terminal.
- Returned requests may be resubmitted.
- Every decision creates an activity log.
- Duplicate decisions are rejected.
- Invalid transitions return predictable errors.

---

# 10. Workflow

Current State Action Next State

---

Submitted Approve Approved
Submitted Reject Rejected
Submitted Return Returned
Returned Resubmit Submitted

---

# 11. High-Level Architecture

    Client
       │
    Routes
       │
    Controllers
       │
    Services
       │
    Repositories
       │
    Prisma ORM
       │
    PostgreSQL

Architecture follows a layered design separating HTTP concerns from
business logic and persistence.

---

# 12. Technology Stack

Category Choice

---

Runtime Node.js 22 LTS
Language TypeScript
Framework Express 5
ORM Prisma
Database PostgreSQL
Validation Zod
Logging Pino
Testing Vitest + Supertest
API Docs Swagger/OpenAPI
Formatting ESLint + Prettier
Git Hooks Husky + lint-staged
Containerization Docker Compose

---

# 13. API Overview

Resources:

- Requests
- Decisions
- Comments
- Health

Representative endpoints:

- POST /requests
- GET /requests
- GET /requests/{id}
- POST /requests/{id}/approve
- POST /requests/{id}/reject
- POST /requests/{id}/return
- POST /requests/{id}/comments
- GET /health

---

# 14. Validation Strategy

- Zod validates all request payloads.
- Business rules validated in the service layer.
- Database constraints enforce integrity.
- Consistent error response structure.

---

# 15. Error Handling

Standard responses:

- 400 Bad Request
- 401 Unauthorized
- 403 Forbidden
- 404 Not Found
- 409 Conflict
- 422 Unprocessable Entity
- 500 Internal Server Error

---

# 16. Security

- Environment variables
- Helmet
- CORS
- Parameterized queries
- Input validation
- Minimal logging of sensitive information

---

# 17. Testing Strategy

Unit Tests

- Workflow logic
- Validation
- Authorization

Integration Tests

- Request lifecycle
- State transitions
- Duplicate decisions
- Invalid transitions
- Activity history

---

# 18. Risks & Trade-offs

- Mock authentication keeps scope focused.
- Single service architecture preferred over microservices.
- No asynchronous processing.
- Simplicity prioritized over extensibility.

---

# 19. Implementation Roadmap

1.  Foundation & Setup (Project setup + Database schema + Validation layer)
2.  Core Domain & Workflow (Core domain + Workflow implementation + REST API)
3.  Logging, Health & Error Handling
4.  Testing + Swagger docs
5.  Documentation & Submission(README & final polish)

---

# 20. Requirement Traceability

Requirement Implementation

---

FR-1 Request endpoints + RequestService
FR-2 WorkflowService
FR-3 CommentService
FR-4 Authorization middleware
FR-5 Activity repository + transaction
