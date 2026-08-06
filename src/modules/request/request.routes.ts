import { Router } from 'express';
import { validate } from '../../shared/middleware/validate.ts';
import { RequestController } from './request.controller.ts';
import {
  createRequestSchema,
  listRequestsQuerySchema,
  requestIdParamsSchema,
} from './request.schema.ts';
import { RequestService } from './request.service.ts';

// Mounted at /requests by the aggregate router (src/routes/index.ts).
const router = Router();

const requestService = new RequestService();
const requestController = new RequestController(requestService);

router.post('/', validate({ body: createRequestSchema }), requestController.createRequest);
router.get('/', validate({ query: listRequestsQuerySchema }), requestController.listRequests);
router.get('/:id', validate({ params: requestIdParamsSchema }), requestController.getRequestById);

export default router;
