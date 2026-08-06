import type { Request, Response } from 'express';
import { SYS_MSG } from '../../shared/constants/system.messages.ts';
import { catchAsync } from '../../shared/utils/async-wrapper.ts';
import { sendCreated } from '../../shared/utils/response.ts';
import type { ReviewerContext } from '../reviewer/reviewer.types.ts';
import type { AddCommentInput } from './comment.schema.ts';
import type { CommentService } from './comment.service.ts';

export class CommentController {
  constructor(private readonly commentService: CommentService) {}

  addComment = catchAsync(async (req: Request, res: Response) => {
    // requireReviewer guarantees reviewer is set for comment routes.
    const reviewer = req.reviewer as ReviewerContext;
    const { body } = req.body as AddCommentInput;
    const comment = await this.commentService.addComment(
      req.params.id as string,
      reviewer.id,
      body,
    );
    sendCreated(res, comment, SYS_MSG.COMMENT_ADDED);
  });
}
