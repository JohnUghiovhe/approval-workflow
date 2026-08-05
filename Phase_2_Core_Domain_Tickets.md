# Phase 2 – Core Domain & Workflow Implementation Tickets

## Epic Goal
Implement the approval workflow, business rules, transactional consistency and REST APIs.

## Ticket 2.1 – Request Module
- Create Request
- View Request
- List Requests

## Ticket 2.2 – Reviewer Authorization
- Resolve reviewer from request header
- Reject unknown reviewers
- Attach reviewer context

## Ticket 2.3 – Workflow Engine
- Approve
- Reject
- Return
- Resubmit
- Enforce valid transitions
- Prevent duplicate decisions

## Ticket 2.4 – Activity Module
Append-only history for:
- Submission
- Approval
- Rejection
- Return
- Resubmission
- Comments

## Ticket 2.5 – Comments
- Add comment
- List comments

## Ticket 2.6 – Transactions
Within Prisma transaction:
1. Update request
2. Create activity
3. Save comment (optional)
4. Commit/Rollback

## Ticket 2.7 – REST API
POST /requests
GET /requests
GET /requests/:id
POST /requests/:id/approve
POST /requests/:id/reject
POST /requests/:id/return
POST /requests/:id/resubmit
POST /requests/:id/comments

## Ticket 2.8 – Verification
- Workflow works
- Authorization enforced
- Audit history immutable
- Duplicate decisions blocked
- Transactions verified
