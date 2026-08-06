import type { ReviewerContext } from '../modules/reviewer/reviewer.types.ts';

declare global {
  namespace Express {
    interface Request {
      reviewer?: ReviewerContext;
    }
  }
}
