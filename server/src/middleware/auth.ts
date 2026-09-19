import type { Request, Response, NextFunction } from 'express';
import type { Role } from '@prisma/client';
import { verifyToken } from '../lib/jwt';
import { env } from '../env';
import { prisma } from '../prisma';
import { ApiError } from './error';

// Verifies the JWT cookie and loads the user. Loading the user on each request
// means deactivating an account takes effect immediately.
export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  try {
    const token = req.cookies?.[env.AUTH_COOKIE_NAME];
    if (!token) throw new ApiError(401, 'Not authenticated');

    const payload = verifyToken(token);
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) throw new ApiError(401, 'Not authenticated');

    req.user = { id: user.id, role: user.role };
    next();
  } catch (e) {
    if (e instanceof ApiError) return next(e);
    return next(new ApiError(401, 'Not authenticated'));
  }
}

// Guards a route to one or more roles. Use after `authenticate`.
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new ApiError(401, 'Not authenticated'));
    if (!roles.includes(req.user.role)) return next(new ApiError(403, 'Forbidden'));
    next();
  };
}
