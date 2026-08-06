import { Router } from 'express';
import { validate } from '../../shared/middleware/validate.ts';
import { requireReviewer } from '../reviewer/reviewer.middleware.ts';
import { CommentController } from './comment.controller.ts';
import { AddCommentSchema, requestIdParamsSchema } from './comment.schema.ts';
import { CommentService } from './comment.service.ts';

// Mounted at /requests by the aggregate router (src/routes/index.ts).
const router = Router();

const commentService = new CommentService();
const commentController = new CommentController(commentService);

router.post(
  '/:id/comments',
  requireReviewer,
  validate({ params: requestIdParamsSchema, body: AddCommentSchema }),
  commentController.addComment,
);

export default router;
