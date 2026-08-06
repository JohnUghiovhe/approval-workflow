import type { Prisma, PrismaClient, comment, reviewer } from '../../generated/prisma/client.ts';

export type DbClient = Prisma.TransactionClient | PrismaClient;

export type CommentWithReviewer = comment & { reviewer: reviewer };

export interface AddCommentRecord {
  requestId: string;
  reviewerId: string;
  body: string;
}

export interface CommentDto {
  id: string;
  requestId: string;
  reviewerId: string;
  reviewerName: string;
  body: string;
  createdAt: string;
}
