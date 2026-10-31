import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { AppError } from '../errors.js';

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.httpStatus).send({
        error: {
          code: error.code,
          message: error.message,
          retryable: error.retryable,
          requestId: request.id,
          ...(error.details === undefined ? {} : { details: error.details }),
        },
      });
    }

    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: {
          code: 'INVALID_ARGUMENT',
          message: 'INVALID_ARGUMENT',
          retryable: false,
          requestId: request.id,
          details: error.issues,
        },
      });
    }

    console.error(error);
    return reply.status(500).send({
      error: {
        code: 'INTERNAL',
        message: 'INTERNAL',
        retryable: true,
        requestId: request.id,
      },
    });
  });

  app.setNotFoundHandler((request, reply) => {
    return reply.status(404).send({
      error: {
        code: 'NOT_FOUND',
        message: 'NOT_FOUND',
        retryable: false,
        requestId: request.id,
      },
    });
  });
}
