import type { Role } from '@prisma/client';

// Attach the authenticated user to Express's Request type.
declare global {
  namespace Express {
    interface Request {
      user?: { id: string; role: Role };
    }
  }
}
