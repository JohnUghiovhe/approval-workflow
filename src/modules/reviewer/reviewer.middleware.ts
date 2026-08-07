import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../../database/index.ts';
import { SYS_MSG } from '../../shared/constants/system.messages.ts';
import { UnauthorizedError } from '../../shared/errors/unauthorized-error.ts';
import { catchAsync } from '../../shared/utils/async-wrapper.ts';
import * as reviewerRepository from './reviewer.repository.ts';

// Authentication is mocked: the bearer token is treated as the reviewer id.
export const requireReviewer = catchAsync(
  async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedError(SYS_MSG.INVALID_AUTHORIZATION_HEADER);
    }

    // Slice past the "Bearer " prefix and trim so a bare header is rejected.
    const token = authHeader.slice(7).trim();
    if (!token) {
      throw new UnauthorizedError(SYS_MSG.INVALID_AUTHORIZATION_HEADER);
    }

    const reviewer = await reviewerRepository.findById(prisma, token);
    if (!reviewer) {
      throw new UnauthorizedError(SYS_MSG.REVIEWER_NOT_FOUND, { reviewer_id: token });
    }

    // Revocation is a persisted state, not a row delete: disabling the reviewer
    // keeps their comments and activity history intact while blocking auth.
    if (!reviewer.is_active) {
      throw new UnauthorizedError(SYS_MSG.REVIEWER_DISABLED, { reviewer_id: token });
    }

    req.reviewer = {
      id: reviewer.id,
      name: reviewer.name,
      email: reviewer.email,
      role: reviewer.role,
    };
    next();
  },
);
