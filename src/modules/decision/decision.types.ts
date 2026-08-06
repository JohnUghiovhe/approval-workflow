import type { Prisma, PrismaClient } from '../../generated/prisma/client.ts';
import type { RequestDto } from '../request/request.types.ts';

export type DbClient = Prisma.TransactionClient | PrismaClient;

// Decision actions for the workflow endpoints. Values match the DecisionAction
// union the activity module accepts, so decisions map straight to activity rows.
export const DecisionAction = {
  APPROVE: 'approve',
  REJECT: 'reject',
  RETURN: 'return',
} as const;

export type DecisionAction = (typeof DecisionAction)[keyof typeof DecisionAction];

export interface ResubmitInput {
  requestId: string;
  requesterName: string;
}

// A decision response extends the updated request with who decided, what was
// decided, and when, so clients do not have to re-read the activity history to
// know which reviewer acted. Resubmits have no reviewer (requester action), so
// reviewerId is nullable.
export interface DecisionDto extends RequestDto {
  decision: 'approve' | 'reject' | 'return' | 'resubmit';
  reviewerId: string | null;
  decidedAt: string;
}
