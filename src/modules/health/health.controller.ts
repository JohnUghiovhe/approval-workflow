import type { Request, Response } from 'express';
import { HttpStatus } from '../../shared/constants/http-status.ts';
import { SYS_MSG } from '../../shared/constants/system.messages.ts';
import { catchAsync } from '../../shared/utils/async-wrapper.ts';
import { sendSuccess } from '../../shared/utils/response.ts';
import type { HealthService } from './health.service.ts';

export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  // Liveness: the process answers, so the check reports the database state but
  // always responds 200. A crashed process is what liveness needs to detect.
  liveness = catchAsync(async (_req: Request, res: Response) => {
    const databaseUp = await this.healthService.isDatabaseUp();
    const result = await this.healthService.check(databaseUp);
    sendSuccess(res, result, SYS_MSG.OPERATION_SUCCESSFUL);
  });

  // Readiness: the service only reports ready when the database is reachable,
  // so callers (load balancers, orchestrators) can route traffic elsewhere.
  readiness = catchAsync(async (_req: Request, res: Response) => {
    const databaseUp = await this.healthService.isDatabaseUp();
    const result = await this.healthService.check(databaseUp);
    const statusCode = result.status === 'healthy' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE;
    sendSuccess(res, result, SYS_MSG.OPERATION_SUCCESSFUL, statusCode);
  });
}
