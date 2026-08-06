import type { Request, Response } from 'express';
import { catchAsync } from '../../shared/utils/async-wrapper.ts';
import { sendSuccess } from '../../shared/utils/response.ts';
import type { ReviewerContext } from '../reviewer/reviewer.types.ts';
import type { DecisionService } from './decision.service.ts';
import type { DecisionBodyInput, ResubmitInput } from './decision.schema.ts';
import { DecisionAction } from './decision.types.ts';

export class DecisionController {
  constructor(private readonly decisionService: DecisionService) {}

  approve = catchAsync(async (req: Request, res: Response) => {
    // requireReviewer guarantees reviewer is set for decision routes.
    const reviewer = req.reviewer as ReviewerContext;
    const request = await this.decisionService.decide(
      req.params.id as string,
      DecisionAction.APPROVE,
      reviewer.id,
    );
    sendSuccess(res, request);
  });

  reject = catchAsync(async (req: Request, res: Response) => {
    const reviewer = req.reviewer as ReviewerContext;
    const { notes } = req.body as DecisionBodyInput;
    const request = await this.decisionService.decide(
      req.params.id as string,
      DecisionAction.REJECT,
      reviewer.id,
      notes,
    );
    sendSuccess(res, request);
  });

  return = catchAsync(async (req: Request, res: Response) => {
    const reviewer = req.reviewer as ReviewerContext;
    const { notes } = req.body as DecisionBodyInput;
    const request = await this.decisionService.decide(
      req.params.id as string,
      DecisionAction.RETURN,
      reviewer.id,
      notes,
    );
    sendSuccess(res, request);
  });

  resubmit = catchAsync(async (req: Request, res: Response) => {
    const { requesterName } = req.body as ResubmitInput;
    const request = await this.decisionService.resubmit(req.params.id as string, requesterName);
    sendSuccess(res, request);
  });
}
