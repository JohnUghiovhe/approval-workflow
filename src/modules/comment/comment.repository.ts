import type { AddCommentRecord, CommentWithReviewer, DbClient } from './comment.types.ts';

export function create(client: DbClient, data: AddCommentRecord): Promise<CommentWithReviewer> {
  return client.comment.create({
    data: {
      request_id: data.requestId,
      reviewer_id: data.reviewerId,
      body: data.body,
    },
    // Load the reviewer so responses expose who commented without a second query.
    include: { reviewer: true },
  });
}

export function findByRequestId(
  client: DbClient,
  requestId: string,
): Promise<CommentWithReviewer[]> {
  return client.comment.findMany({
    where: { request_id: requestId },
    include: { reviewer: true },
    orderBy: { created_at: 'asc' },
  });
}
