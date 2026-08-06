import { activity_action, request_status } from '../../generated/prisma/client.ts';
import { prisma } from '../../database/index.ts';
import { SYS_MSG } from '../../shared/constants/system.messages.ts';
import { NotFoundError } from '../../shared/errors/not-found-error.ts';
import { findById as findRequestById } from '../request/request.repository.ts';
import * as activityRepository from './activity.repository.ts';
import type { ActivityDto, DbClient, DecisionAction } from './activity.types.ts';

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

function toActivityDto(row: Awaited<ReturnType<typeof listByRequestId>>[number]): ActivityDto {
  return {
    id: row.id,
    requestId: row.request_id,
    reviewerId: row.reviewer_id,
    action: row.action,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    note: row.note,
    createdAt: row.created_at.toISOString(),
  };
}

// The public history endpoint: the request must exist, then return its
// append-only activity rows in creation order.
export async function getActivitiesByRequestId(requestId: string): Promise<ActivityDto[]> {
  const exists = await findRequestById(prisma, requestId);
  if (!exists) {
    throw new NotFoundError(SYS_MSG.REQUEST_NOT_FOUND, { request_id: requestId });
  }
  const rows = await activityRepository.listByRequestId(prisma, requestId);
  return rows.map(toActivityDto);
}

export const activityService = {
  recordSubmission,
  recordDecision,
  recordResubmission,
  recordComment,
  listByRequestId,
  getActivitiesByRequestId,
};
