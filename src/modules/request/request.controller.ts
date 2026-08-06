import type { Request, Response } from 'express';
import { SYS_MSG } from '../../shared/constants/system.messages.ts';
import { catchAsync } from '../../shared/utils/async-wrapper.ts';
import { sendCreated, sendSuccess } from '../../shared/utils/response.ts';
import type { RequestService } from './request.service.ts';

export class RequestController {
  constructor(private readonly requestService: RequestService) {}

  createRequest = catchAsync(async (req: Request, res: Response) => {
    const request = await this.requestService.createRequest(req.body);
    sendCreated(res, request, SYS_MSG.REQUEST_CREATED);
  });

  listRequests = catchAsync(async (req: Request, res: Response) => {
    const result = await this.requestService.listRequests(req.query);
    sendSuccess(res, result);
  });

  getRequestById = catchAsync(async (req: Request, res: Response) => {
    // Route guarantees a single :id segment, so the value is a string.
    const request = await this.requestService.getRequestById(req.params.id as string);
    sendSuccess(res, request);
  });
}
