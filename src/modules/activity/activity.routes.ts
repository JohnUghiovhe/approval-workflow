import { Router } from 'express';
import { validate } from '../../shared/middleware/validate.ts';
import { requestIdParamsSchema } from '../request/request.schema.ts';
import { ActivityController } from './activity.controller.ts';

// Mounted at /requests/:id/activities by the aggregate router
// (src/routes/index.ts). Public read-only endpoint for the append-only trail.
const router = Router();

const activityController = new ActivityController();

router.get(
  '/:id/activities',
  validate({ params: requestIdParamsSchema }),
  activityController.listByRequestId,
);

export default router;
