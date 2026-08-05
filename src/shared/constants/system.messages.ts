export const SYS_MSG = {
  OPERATION_SUCCESSFUL: 'Operation completed successfully',
  VALIDATION_ERROR: 'Validation failed',
  RESOURCE_NOT_FOUND: 'Resource not found',
  INTERNAL_SERVER_ERROR: 'An unexpected error occurred',
  SEED_SUCCESS: 'Database seeded successfully',
  SEED_SKIPPED: 'Database already contains data; skipping seed',
} as const;

export type SystemMessage = (typeof SYS_MSG)[keyof typeof SYS_MSG];
