import { Router } from 'express';
import activityRouter from '../modules/activity/activity.routes.ts';
import commentRouter from '../modules/comment/comment.routes.ts';
import decisionRouter from '../modules/decision/decision.routes.ts';
import requestRouter from '../modules/request/request.routes.ts';

// All modules live under /requests; the decision, comment and activity routers
// extend it with /approve, /reject, /return, /resubmit, /comments and
// /activities. Express tries them in order, and method + path matching routes
// each request to the right handler.
const apiRouter = Router();

apiRouter.use('/requests', requestRouter);
apiRouter.use('/requests', decisionRouter);
apiRouter.use('/requests', commentRouter);
apiRouter.use('/requests', activityRouter);

export default apiRouter;
