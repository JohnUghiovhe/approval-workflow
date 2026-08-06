import { Router } from 'express';
import commentRouter from '../modules/comment/comment.routes.ts';
import decisionRouter from '../modules/decision/decision.routes.ts';
import requestRouter from '../modules/request/request.routes.ts';

// All three modules live under /requests; the decision and comment routers
// extend it with /approve, /reject, /return, /resubmit and /comments. Express
// tries them in order, and method + path matching routes each request to the
// right handler.
const apiRouter = Router();

apiRouter.use('/requests', requestRouter);
apiRouter.use('/requests', decisionRouter);
apiRouter.use('/requests', commentRouter);

export default apiRouter;
