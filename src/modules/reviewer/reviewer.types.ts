import type { Prisma, PrismaClient } from '../../generated/prisma/client.ts';

export type DbClient = Prisma.TransactionClient | PrismaClient;

// Reviewer identity attached to the request by requireReviewer; mirrors the
// columns the decision and comment modules need from the reviewer row.
export interface ReviewerContext {
  id: string;
  name: string;
  email: string;
  role: string;
}
