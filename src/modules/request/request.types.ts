import type { Prisma, PrismaClient } from '../../generated/prisma/client.ts';
import type { request_status } from '../../generated/prisma/client.ts';
import type { CommentDto } from '../comment/comment.types.ts';
import type { ActivityDto } from '../activity/activity.types.ts';

export type DbClient = Prisma.TransactionClient | PrismaClient;

export interface ListRequestsInput {
  status?: request_status;
  page: number;
  pageSize: number;
}

// Reuse the canonical CommentDto and ActivityDto definitions from their
// owning modules to avoid duplication and drift.

export interface RequestDto {
  id: string;
  title: string;
  description: string;
  department: string;
  requesterName: string;
  status: request_status;
  createdAt: string;
  updatedAt: string;
  comments: CommentDto[];
  activities: ActivityDto[];
}

export interface ListRequestsResult {
  data: RequestDto[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
