export const SYS_MSG = {
  OPERATION_SUCCESSFUL: 'Operation completed successfully',
  VALIDATION_ERROR: 'Validation failed',
  RESOURCE_NOT_FOUND: 'Resource not found',
  INTERNAL_SERVER_ERROR: 'An unexpected error occurred',
} as const;

export type SystemMessage = (typeof SYS_MSG)[keyof typeof SYS_MSG];
