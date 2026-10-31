export const ERROR_META = {
  INVALID_ARGUMENT: { httpStatus: 400, retryable: false },
  TEXT_TOO_LONG: { httpStatus: 400, retryable: false },
  UNSUPPORTED_CAPABILITY: { httpStatus: 400, retryable: false },
  UNAUTHORIZED: { httpStatus: 401, retryable: false },
  QUOTA_EXCEEDED: { httpStatus: 402, retryable: false },
  FORBIDDEN: { httpStatus: 403, retryable: false },
  NOT_FOUND: { httpStatus: 404, retryable: false },
  PAYLOAD_TOO_LARGE: { httpStatus: 413, retryable: false },
  UNSUPPORTED_MEDIA: { httpStatus: 415, retryable: false },
  CONTENT_REJECTED: { httpStatus: 422, retryable: false },
  RATE_LIMITED: { httpStatus: 429, retryable: true },
  PROVIDER_UNAVAILABLE: { httpStatus: 503, retryable: true },
  PROVIDER_TIMEOUT: { httpStatus: 504, retryable: true },
  INTERNAL: { httpStatus: 500, retryable: true },
} as const;

export type ErrorCode = keyof typeof ERROR_META;
