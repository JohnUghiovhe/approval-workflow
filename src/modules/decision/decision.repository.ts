import type { request_status } from '../../generated/prisma/client.ts';
import type { DbClient } from './decision.types.ts';

// The decision module reads requests through the request module's repository so
// there is a single source of truth for the request row and its relations.
export { findById } from '../request/request.repository.ts';

// Guarded status update: only transitions from the exact fromStatus succeed.
// The affected count is 0 when the request is gone or was already moved by a
// concurrent decision, which the service turns into a ConflictError.
export async function updateStatusGuarded(
  client: DbClient,
  id: string,
  fromStatus: request_status,
  toStatus: request_status,
): Promise<number> {
  const result = await client.request.updateMany({
    where: { id, status: fromStatus },
    data: { status: toStatus },
  });
  return result.count;
}
