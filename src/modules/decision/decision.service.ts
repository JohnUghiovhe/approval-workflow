import { request_status } from '../../generated/prisma/client.ts';
import { prisma } from '../../database/index.ts';
import { SYS_MSG } from '../../shared/constants/system.messages.ts';
import { BadRequestError } from '../../shared/errors/bad-request-error.ts';
import { ConflictError } from '../../shared/errors/conflict-error.ts';
import { NotFoundError } from '../../shared/errors/not-found-error.ts';
import { activityService } from '../activity/activity.service.ts';
import { toRequestDto } from '../request/request.service.ts';
import * as decisionRepository from './decision.repository.ts';
import { DecisionAction } from './decision.types.ts';
import type { DecisionAction as DecisionActionType, DecisionDto } from './decision.types.ts';

const ACTION_TO_TARGET_STATUS: Record<DecisionActionType, request_status> = {
  [DecisionAction.APPROVE]: request_status.APPROVED,
  [DecisionAction.REJECT]: request_status.REJECTED,
  [DecisionAction.RETURN]: request_status.RETURNED,
};

// Enforces the TRD state machine: a SUBMITTED request accepts approve, reject
// and return; a RETURNED request has no decide actions (resubmit only); and
// APPROVED/REJECTED are terminal. Exported so tests exercise the table directly.
export class DecisionService {
  validateTransition(currentStatus: request_status, action: DecisionActionType): boolean {
    if (currentStatus === request_status.SUBMITTED) {
      return [DecisionAction.APPROVE, DecisionAction.REJECT, DecisionAction.RETURN].includes(
        action,
      );
    }
    return false;
  }

  async decide(
    requestId: string,
    action: DecisionActionType,
    reviewerId: string,
    notes?: string,
  ): Promise<DecisionDto> {
    const current = await decisionRepository.findById(prisma, requestId);
    if (!current) {
      throw new NotFoundError(SYS_MSG.REQUEST_NOT_FOUND, { request_id: requestId });
    }

    const targetStatus = ACTION_TO_TARGET_STATUS[action];
    if (!this.validateTransition(current.status, action)) {
      throw new BadRequestError(SYS_MSG.INVALID_STATE_TRANSITION, {
        request_id: requestId,
        current_status: current.status,
        attempted_decision: action,
      });
    }

    // Update, record the activity and re-read in one transaction. The status
    // guard makes the update a no-op if a concurrent decision moved the request
    // first, which surfaces as a duplicate decision.
    const updated = await prisma.$transaction(async (tx) => {
      const affected = await decisionRepository.updateStatusGuarded(
        tx,
        requestId,
        current.status,
        targetStatus,
      );
      if (affected === 0) {
        throw new ConflictError(SYS_MSG.DUPLICATE_DECISION, {
          request_id: requestId,
          decision: action,
        });
      }
      await activityService.recordDecision(
        tx,
        requestId,
        reviewerId,
        action,
        current.status,
        targetStatus,
        notes,
      );
      return decisionRepository.findById(tx, requestId);
    });

    if (!updated) {
      throw new NotFoundError(SYS_MSG.REQUEST_NOT_FOUND, { request_id: requestId });
    }
    return toRequestDto(updated);
  }

  async resubmit(requestId: string, requesterName: string): Promise<DecisionDto> {
    const current = await decisionRepository.findById(prisma, requestId);
    if (!current) {
      throw new NotFoundError(SYS_MSG.REQUEST_NOT_FOUND, { request_id: requestId });
    }

    if (current.status !== request_status.RETURNED) {
      throw new BadRequestError(SYS_MSG.INVALID_STATE_TRANSITION, {
        request_id: requestId,
        current_status: current.status,
        attempted_decision: 'resubmit',
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const affected = await decisionRepository.updateStatusGuarded(
        tx,
        requestId,
        request_status.RETURNED,
        request_status.SUBMITTED,
      );
      if (affected === 0) {
        throw new ConflictError(SYS_MSG.DUPLICATE_DECISION, {
          request_id: requestId,
          decision: 'resubmit',
        });
      }
      await activityService.recordResubmission(tx, requestId, requesterName);
      return decisionRepository.findById(tx, requestId);
    });

    if (!updated) {
      throw new NotFoundError(SYS_MSG.REQUEST_NOT_FOUND, { request_id: requestId });
    }
    return toRequestDto(updated);
  }
}
