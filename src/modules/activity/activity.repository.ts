import type { activity, activity_action, request_status } from '../../generated/prisma/client.ts';
import type { DbClient } from './activity.types.ts';

export interface CreateActivityRecord {
  request_id: string;
  reviewer_id?: string;
  action: activity_action;
  from_status?: request_status | null;
  to_status?: request_status | null;
  note?: string | null;
  created_at?: Date;
}

// Create only: activity rows are append-only, so no update or delete helpers
// exist here. The caller supplies the transaction or default client.
export function create(client: DbClient, data: CreateActivityRecord): Promise<activity> {
  return client.activity.create({ data });
}

// Bulk create used by the seed to backfill the audit trail for seeded
// requests; the existing rows are created through `create` inside a
// transaction.
export function createMany(client: DbClient, data: CreateActivityRecord[]): Promise<unknown> {
  return client.activity.createMany({ data });
}

export function listByRequestId(client: DbClient, requestId: string): Promise<activity[]> {
  return client.activity.findMany({
    where: { request_id: requestId },
    orderBy: { created_at: 'asc' },
  });
}
