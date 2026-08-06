import type { activity, comment, request } from '../../generated/prisma/client.ts';
import { prisma } from '../../database/index.ts';
import { SYS_MSG } from '../../shared/constants/system.messages.ts';
import { formatZodError } from '../../shared/errors/error-formatter.ts';
import { NotFoundError } from '../../shared/errors/not-found-error.ts';
import { ValidationError } from '../../shared/errors/validation-error.ts';
import { activityService } from '../activity/activity.service.ts';
import * as requestRepository from './request.repository.ts';
import { createRequestSchema, listRequestsQuerySchema } from './request.schema.ts';
import type { ActivityDto, CommentDto, ListRequestsResult, RequestDto } from './request.types.ts';

function toCommentDto(row: comment): CommentDto {
  return {
    id: row.id,
    requestId: row.request_id,
    reviewerId: row.reviewer_id,
    body: row.body,
    createdAt: row.created_at.toISOString(),
  };
}

function toActivityDto(row: activity): ActivityDto {
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

// Map snake_case rows to the camelCase API shape (rule 12). Relations are
// optional because list/create rows do not load them. Shared with the decision
// module so every endpoint returns the same request payload.
export function toRequestDto(
  row: request & { comments?: comment[]; activities?: activity[] },
): RequestDto {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    department: row.department,
    requesterName: row.requester_name,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    comments: (row.comments ?? []).map(toCommentDto),
    activities: (row.activities ?? []).map(toActivityDto),
  };
}

export class RequestService {
  async createRequest(payload: unknown): Promise<RequestDto> {
    const parsed = createRequestSchema.safeParse(payload);
    if (!parsed.success) {
      throw new ValidationError(SYS_MSG.VALIDATION_ERROR, formatZodError(parsed.error));
    }

    // Create the request and its SUBMISSION activity in one transaction so a
    // failure in either step leaves no partial row behind.
    const created = await prisma.$transaction(async (tx) => {
      const row = await requestRepository.create(tx, {
        title: parsed.data.title,
        // The column is NOT NULL, so an omitted or empty description is stored
        // as an empty string; null is rejected by the schema as a type error.
        description: parsed.data.description ?? '',
        department: parsed.data.department,
        requester_name: parsed.data.requesterName,
      });
      await activityService.recordSubmission(tx, row.id, parsed.data.requesterName);
      return row;
    });

    return toRequestDto(created);
  }

  async listRequests(query: unknown): Promise<ListRequestsResult> {
    const parsed = listRequestsQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new ValidationError(SYS_MSG.VALIDATION_ERROR, formatZodError(parsed.error));
    }

    const { status, page, pageSize } = parsed.data;
    const [rows, total] = await Promise.all([
      requestRepository.findMany(prisma, {
        status,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      requestRepository.count(prisma, status),
    ]);

    return {
      data: rows.map(toRequestDto),
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async getRequestById(id: string): Promise<RequestDto> {
    const row = await requestRepository.findById(prisma, id);
    if (!row) {
      throw new NotFoundError(SYS_MSG.REQUEST_NOT_FOUND, { request_id: id });
    }
    return toRequestDto(row);
  }
}
