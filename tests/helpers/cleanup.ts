import { prisma } from '../../src/database/index.ts';

// Delete in FK-safe order: comments and activities reference requests (Cascade
// on request delete) while comments Restrict on reviewers, so reviewers go
// last. Clearing every table keeps leftover rows from leaking between cases.
export async function resetDatabase(): Promise<void> {
  await prisma.comment.deleteMany();
  await prisma.activity.deleteMany();
  await prisma.request.deleteMany();
  await prisma.reviewer.deleteMany();
}
