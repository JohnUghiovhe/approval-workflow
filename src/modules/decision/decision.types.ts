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

// A decision returns the updated request; reuse the request module's camelCase
// shape so every endpoint exposes the same payload.
export type DecisionDto = RequestDto;
