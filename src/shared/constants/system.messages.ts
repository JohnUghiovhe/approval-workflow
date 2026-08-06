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
  INTERNAL_SERVER_ERROR: 'An unexpected error occurred',
  SEED_SUCCESS: 'Database seeded successfully',
  SEED_SKIPPED: 'Database already contains data; skipping seed',
} as const;

export type SystemMessage = (typeof SYS_MSG)[keyof typeof SYS_MSG];
