import type { RequestHandler } from 'express';
import { SYS_MSG } from '../constants/system.messages.ts';
import { NotFoundError } from '../errors/not-found-error.ts';

// Convert any unmatched route into the JSON 404 envelope so clients always
// receive the ApiErrorResponse shape instead of Express's default HTML page.
// The unmatched path rides in `details` so a 404 on a wrong path is
// distinguishable from a missing resource on a correct one.
export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new NotFoundError(SYS_MSG.RESOURCE_NOT_FOUND, { path: req.originalUrl }));
};
