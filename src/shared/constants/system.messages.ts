export const SYS_MSG = {
  OPERATION_SUCCESSFUL: 'Operation completed successfully',
  BAD_REQUEST: 'Bad request',
  UNAUTHORIZED: 'Unauthorized',
  FORBIDDEN: 'Forbidden',
  RESOURCE_NOT_FOUND: 'Resource not found',
  CONFLICT: 'Conflict with the current state of the resource',
  VALIDATION_ERROR: 'Validation failed',
  REQUEST_CREATED: 'Request created successfully',
  REQUEST_NOT_FOUND: 'Request not found',
  INVALID_STATE_TRANSITION: 'Request cannot transition to the requested state',
  DUPLICATE_DECISION: 'A decision has already been recorded for this request',
  INVALID_AUTHORIZATION_HEADER: 'Missing or invalid authorization header',
  REVIEWER_NOT_FOUND: 'Reviewer not found',
  COMMENT_ADDED: 'Comment added successfully',
  SERVICE_UNAVAILABLE: 'Service is not ready',
  INTERNAL_SERVER_ERROR: 'An unexpected error occurred',
  SEED_SUCCESS: 'Database seeded successfully',
} as const;

export type SystemMessage = (typeof SYS_MSG)[keyof typeof SYS_MSG];
