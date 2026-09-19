import { Router } from 'express';
import type { CookieOptions } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { verifyPassword } from '../lib/password';
import { signToken } from '../lib/jwt';
import { toPublicUser } from '../lib/publicUser';
import { env } from '../env';
import { asyncHandler, ApiError } from '../middleware/error';
import { authenticate } from '../middleware/auth';

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const cookieOptions: CookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: env.NODE_ENV === 'production',
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

// POST /api/auth/login
router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });

    // Same error whether the email is unknown, the password is wrong, or the
    // account is disabled — don't leak which.
    if (!user || !user.isActive) throw new ApiError(401, 'Invalid credentials');
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) throw new ApiError(401, 'Invalid credentials');

    const token = signToken({ sub: user.id, role: user.role });
    res.cookie(env.AUTH_COOKIE_NAME, token, cookieOptions);
    res.json({ user: toPublicUser(user) });
  }),
);

// POST /api/auth/logout
router.post('/logout', (_req, res) => {
  res.clearCookie(env.AUTH_COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
});

// GET /api/auth/me
router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) throw new ApiError(401, 'Not authenticated');
    res.json({ user: toPublicUser(user) });
  }),
);

export default router;
