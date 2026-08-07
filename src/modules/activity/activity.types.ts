import type {
  Prisma,
  PrismaClient,
  activity_action,
  request_status,
} from '../../generated/prisma/client.ts';

export type DbClient = Prisma.TransactionClient | PrismaClient;

// Decision actions accepted by recordDecision; the module owning the decision
// workflow maps them to activity_action values.
export type DecisionAction = 'approve' | 'reject' | 'return';

// CamelCase API shape for a single activity row. The action keeps
// its stored enum value so clients can branch on it directly.
export interface ActivityDto {
  id: string;
  requestId: string;
  reviewerId: string | null;
  action: activity_action;
  fromStatus: request_status | null;
  toStatus: request_status | null;
  note: string | null;
  createdAt: string;
}
