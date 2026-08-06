import type { Request, Response } from 'express';
import { catchAsync } from '../../shared/utils/async-wrapper.ts';
import { sendSuccess } from '../../shared/utils/response.ts';
import { activityService } from './activity.service.ts';

export class ActivityController {
  listByRequestId = catchAsync(async (req: Request, res: Response) => {
    // Route guarantees a single :id segment, so the value is a string.
    const activities = await activityService.getActivitiesByRequestId(req.params.id as string);
    sendSuccess(res, { activities });
  });
}
