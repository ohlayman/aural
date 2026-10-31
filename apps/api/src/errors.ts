import { ERROR_META, type ErrorCode } from '@aural/shared';

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message?: string,
    public details?: unknown,
  ) {
    super(message ?? code);
    this.name = 'AppError';
  }

  get httpStatus(): number {
    return ERROR_META[this.code].httpStatus;
  }

  get retryable(): boolean {
    return ERROR_META[this.code].retryable;
  }
}
