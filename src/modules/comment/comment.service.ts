import { prisma } from '../../database/index.ts';
import { SYS_MSG } from '../../shared/constants/system.messages.ts';
import { formatZodError } from '../../shared/errors/error-formatter.ts';
import { NotFoundError } from '../../shared/errors/not-found-error.ts';
import { ValidationError } from '../../shared/errors/validation-error.ts';
import { activityService } from '../activity/activity.service.ts';
import { findById as findRequestById } from '../request/request.repository.ts';
import * as commentRepository from './comment.repository.ts';
import { AddCommentSchema } from './comment.schema.ts';
import type { CommentDto, CommentWithReviewer } from './comment.types.ts';

function toCommentDto(row: CommentWithReviewer): CommentDto {
  return {
    id: row.id,
    requestId: row.request_id,
    reviewerId: row.reviewer_id,
    reviewerName: row.reviewer.name,
    body: row.body,
    createdAt: row.created_at.toISOString(),
  };
}

export class CommentService {
  async addComment(requestId: string, reviewerId: string, body: string): Promise<CommentDto> {
    const parsed = AddCommentSchema.safeParse({ body });
    if (!parsed.success) {
      throw new ValidationError(SYS_MSG.VALIDATION_ERROR, formatZodError(parsed.error));
    }

    // The comment and its activity commit or roll back together, and the
    // request existence check rides the same transaction so a comment can
    // never land against a request that disappeared.
    const comment = await prisma.$transaction(async (tx) => {
      const exists = await findRequestById(tx, requestId);
      if (!exists) {
        throw new NotFoundError(SYS_MSG.REQUEST_NOT_FOUND, { request_id: requestId });
      }
      const created = await commentRepository.create(tx, {
        requestId,
        reviewerId,
        body: parsed.data.body,
      });
      await activityService.recordComment(tx, requestId, reviewerId, parsed.data.body);
      return created;
    });

    return toCommentDto(comment);
  }
}
