import type { activity, comment, request, request_status } from '../../generated/prisma/client.ts';
import type { DbClient } from './request.types.ts';

export interface CreateRequestRecord {
  title: string;
  description: string;
  department: string;
  requester_name: string;
}

// findById returns the request with its comments and activities attached, so
// the callers see a fully populated history without extra queries.
export type RequestWithRelations = request & {
  comments: comment[];
  activities: activity[];
};

export function create(client: DbClient, data: CreateRequestRecord): Promise<request> {
  return client.request.create({ data });
}

export function findMany(
  client: DbClient,
  options: { status?: request_status; skip: number; take: number },
): Promise<request[]> {
  const { status, skip, take } = options;
  return client.request.findMany({
    where: status ? { status } : undefined,
    orderBy: { created_at: 'desc' },
    skip,
    take,
  });
}

export function count(client: DbClient, status?: request_status): Promise<number> {
  return client.request.count({ where: status ? { status } : undefined });
}

export function findById(client: DbClient, id: string): Promise<RequestWithRelations | null> {
  return client.request.findUnique({
    where: { id },
    include: {
      comments: { orderBy: { created_at: 'asc' } },
      activities: { orderBy: { created_at: 'asc' } },
    },
  });
}
