import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';

export function globalErrorHandler(
  error: FastifyError | Error,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  if (error instanceof ZodError) {
    void reply.status(400).send({
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request parameters or payload',
        issues: error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      },
    });
    return;
  }

  if (error instanceof AppError) {
    void reply.status(error.statusCode).send({
      ok: false,
      error: {
        code: error.code,
        message: error.message,
      },
    });
    return;
  }

  if ('statusCode' in error && typeof error.statusCode === 'number' && error.statusCode < 500) {
    void reply.status(error.statusCode).send({
      ok: false,
      error: {
        code: error.code || 'REQUEST_ERROR',
        message: error.message,
      },
    });
    return;
  }

  logger.error(
    {
      err: error,
      method: request.method,
      url: request.url,
    },
    'Unhandled API error',
  );

  void reply.status(500).send({
    ok: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected internal error occurred',
    },
  });
}
