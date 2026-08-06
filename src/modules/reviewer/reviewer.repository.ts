import type { reviewer } from '../../generated/prisma/client.ts';
import type { DbClient } from './reviewer.types.ts';

export function findById(client: DbClient, id: string): Promise<reviewer | null> {
  return client.reviewer.findUnique({ where: { id } });
}
