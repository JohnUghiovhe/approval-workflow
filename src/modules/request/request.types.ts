import type { Prisma, PrismaClient } from '../../generated/prisma/client.ts';
import type { activity_action, request_status } from '../../generated/prisma/client.ts';

export type DbClient = Prisma.TransactionClient | PrismaClient;

export interface ListRequestsInput {
  status?: request_status;
  page: number;
  pageSize: number;
}

export interface CommentDto {
  id: string;
  requestId: string;
  reviewerId: string;
  body: string;
  createdAt: string;
}

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
}
