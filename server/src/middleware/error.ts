import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

// A typed error carrying an HTTP status. Throw this from anywhere in a route.
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// Wrap async handlers so rejected promises reach the error middleware instead
// of crashing the process / hanging the request.
export const asyncHandler =
  <T = unknown>(
    fn: (req: Request, res: Response, next: NextFunction) => Promise<T>,
  ) =>
  (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res, next)).catch(next);

// Central error handler. Must be registered last, with all four args so Express
// recognizes it as error-handling middleware.
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: err.message });
  }
  if (err instanceof ZodError) {
    return res
      .status(400)
      .json({ error: 'Validation failed', details: err.flatten() });
  }
  console.error('Unhandled error:', err);
  return res.status(500).json({ error: 'Internal server error' });
}
