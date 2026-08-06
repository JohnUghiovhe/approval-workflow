import { Router } from 'express';
import { validate } from '../../shared/middleware/validate.ts';
import { requireReviewer } from '../reviewer/reviewer.middleware.ts';
import { DecisionController } from './decision.controller.ts';
import { DecisionBodySchema, requestIdParamsSchema, ResubmitSchema } from './decision.schema.ts';
import { DecisionService } from './decision.service.ts';

// Mounted at /requests by the aggregate router (src/routes/index.ts).
const router = Router();

const decisionService = new DecisionService();
const decisionController = new DecisionController(decisionService);

// Decisions are reviewer-only; resubmit is public because it is the requester
// responding to a return.
router.post(
  '/:id/approve',
  requireReviewer,
  validate({ params: requestIdParamsSchema }),
  decisionController.approve,
);
router.post(
  '/:id/reject',
  requireReviewer,
  validate({ params: requestIdParamsSchema, body: DecisionBodySchema }),
  decisionController.reject,
);
router.post(
  '/:id/return',
  requireReviewer,
  validate({ params: requestIdParamsSchema, body: DecisionBodySchema }),
  decisionController.return,
);
router.post(
  '/:id/resubmit',
  validate({ params: requestIdParamsSchema, body: ResubmitSchema }),
  decisionController.resubmit,
);

export default router;
