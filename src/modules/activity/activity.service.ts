import { activity_action, request_status } from '../../generated/prisma/client.ts';
import * as activityRepository from './activity.repository.ts';
import type { DbClient, DecisionAction } from './activity.types.ts';

const DECISION_TO_ACTIVITY_ACTION: Record<DecisionAction, activity_action> = {
  approve: activity_action.APPROVAL,
  reject: activity_action.REJECTION,
  return: activity_action.RETURN,
};

export function recordSubmission(client: DbClient, requestId: string, requesterName: string) {
  return activityRepository.create(client, {
    request_id: requestId,
    action: activity_action.SUBMISSION,
    to_status: request_status.SUBMITTED,
    note: requesterName,
  });
}

export function recordDecision(
  client: DbClient,
  requestId: string,
  reviewerId: string,
  action: DecisionAction,
  fromStatus: request_status | null,
  toStatus: request_status,
  notes?: string,
) {
  return activityRepository.create(client, {
    request_id: requestId,
    reviewer_id: reviewerId,
    action: DECISION_TO_ACTIVITY_ACTION[action],
    from_status: fromStatus,
    to_status: toStatus,
    note: notes ?? null,
  });
}

export function recordResubmission(client: DbClient, requestId: string, requesterName: string) {
  return activityRepository.create(client, {
    request_id: requestId,
    action: activity_action.RESUBMISSION,
    from_status: request_status.RETURNED,
    to_status: request_status.SUBMITTED,
    note: requesterName,
  });
}

export function recordComment(
  client: DbClient,
  requestId: string,
  reviewerId: string,
  body: string,
) {
  return activityRepository.create(client, {
    request_id: requestId,
    reviewer_id: reviewerId,
    action: activity_action.COMMENT,
    note: body,
  });
}

export function listByRequestId(client: DbClient, requestId: string) {
  return activityRepository.listByRequestId(client, requestId);
}

export const activityService = {
  recordSubmission,
  recordDecision,
  recordResubmission,
  recordComment,
  listByRequestId,
};
