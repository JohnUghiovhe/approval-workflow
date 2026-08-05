import type { RequestHandler } from 'express';
import { NotFoundError } from '../errors/not-found-error.ts';

// Convert any unmatched route into the JSON 404 envelope so clients always
// receive the ApiErrorResponse shape instead of Express's default HTML page.
export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new NotFoundError());
};
