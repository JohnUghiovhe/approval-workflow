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
    // Cheap existence check before opening the transaction.
    const current = await decisionRepository.findById(prisma, requestId);
    if (!current) {
      throw new NotFoundError(SYS_MSG.REQUEST_NOT_FOUND, { request_id: requestId });
    }

    const targetStatus = ACTION_TO_TARGET_STATUS[action];

    // The transition must be validated and guarded against the status read
    // inside the transaction, never a snapshot taken before it. Otherwise a
    // concurrent decision can move the request between the read and the update
    // and this call would either commit from a stale state or mislabel the
    // error. The pre-transaction snapshot distinguishes a sequential invalid
    // transition (already decided before this call: 400) from a concurrent
    // duplicate decision (moved while this call was in flight: 409).
    if (!this.validateTransition(current.status, action)) {
      throw new BadRequestError(SYS_MSG.INVALID_STATE_TRANSITION, {
        request_id: requestId,
        current_status: current.status,
        attempted_decision: action,
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const fresh = await decisionRepository.findById(tx, requestId);
      if (!fresh) {
        throw new NotFoundError(SYS_MSG.REQUEST_NOT_FOUND, { request_id: requestId });
      }

      // The snapshot said SUBMITTED but the fresh read no longer does, so a
      // concurrent decision won. That is a duplicate decision, not an invalid
      // transition, and the guarded update below would be a no-op anyway.
      if (fresh.status !== current.status) {
        throw new ConflictError(SYS_MSG.DUPLICATE_DECISION, {
          request_id: requestId,
          decision: action,
        });
      }

      // The status guard makes the update a no-op if a concurrent decision moved
      // the request after the fresh read, which surfaces as a duplicate decision.
      const affected = await decisionRepository.updateStatusGuarded(
        tx,
        requestId,
        fresh.status,
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
        fresh.status,
        targetStatus,
        notes,
      );
      return decisionRepository.findById(tx, requestId);
    });

    if (!updated) {
      throw new NotFoundError(SYS_MSG.REQUEST_NOT_FOUND, { request_id: requestId });
    }
    return {
      ...toRequestDto(updated),
      decision: action,
      reviewerId,
      decidedAt: updated.updated_at.toISOString(),
    };
  }

  async resubmit(requestId: string, requesterName: string): Promise<DecisionDto> {
    const current = await decisionRepository.findById(prisma, requestId);
    if (!current) {
      throw new NotFoundError(SYS_MSG.REQUEST_NOT_FOUND, { request_id: requestId });
    }

    // Same reasoning as decide: re-read and validate inside the transaction so
    // the RETURNED check cannot race with a concurrent decision. A snapshot
    // that is not RETURNED is a sequential invalid transition (400); a status
    // that changes while this call is in flight is a concurrent duplicate (409).
    if (current.status !== request_status.RETURNED) {
      throw new BadRequestError(SYS_MSG.INVALID_STATE_TRANSITION, {
        request_id: requestId,
        current_status: current.status,
        attempted_decision: 'resubmit',
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const fresh = await decisionRepository.findById(tx, requestId);
      if (!fresh) {
        throw new NotFoundError(SYS_MSG.REQUEST_NOT_FOUND, { request_id: requestId });
      }

      if (fresh.status !== request_status.RETURNED) {
        throw new ConflictError(SYS_MSG.DUPLICATE_DECISION, {
          request_id: requestId,
          decision: 'resubmit',
        });
      }

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
    return {
      ...toRequestDto(updated),
      decision: 'resubmit',
      reviewerId: null,
      decidedAt: updated.updated_at.toISOString(),
    };
  }
}
