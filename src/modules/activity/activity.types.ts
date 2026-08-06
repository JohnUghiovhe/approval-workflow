import type { Prisma, PrismaClient } from '../../generated/prisma/client.ts';

export type DbClient = Prisma.TransactionClient | PrismaClient;

// Decision actions accepted by recordDecision; the module owning the decision
// workflow maps them to activity_action values.
export type DecisionAction = 'approve' | 'reject' | 'return';
