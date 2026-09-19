import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { hashPassword } from '../lib/password';
import { toPublicUser } from '../lib/publicUser';
import { asyncHandler, ApiError } from '../middleware/error';
import { authenticate, requireRole } from '../middleware/auth';
import { adjustCredits, setBalance } from '../services/creditService';

const router = Router();

// Everything here is admin-only.
router.use(authenticate, requireRole('admin'));

// GET /api/users — list all users
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
    res.json({ users: users.map(toPublicUser) });
  }),
);

const createSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['admin', 'worker']).default('worker'),
  initialCredits: z.number().int().nonnegative().default(0),
});

// POST /api/users — create a worker (or admin)
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);
    const email = body.email.trim().toLowerCase();

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new ApiError(409, 'A user with that email already exists');

    const passwordHash = await hashPassword(body.password);
    const user = await prisma.user.create({
      data: { email, passwordHash, role: body.role },
    });

    if (body.initialCredits > 0) {
      await adjustCredits(user.id, body.initialCredits, 'Initial credit grant');
    }

    const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    res.status(201).json({ user: toPublicUser(fresh) });
  }),
);

const updateSchema = z.object({
  isActive: z.boolean().optional(),
  password: z.string().min(8).optional(),
  role: z.enum(['admin', 'worker']).optional(),
});

// PATCH /api/users/:id — enable/disable, reset password, change role
router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const body = updateSchema.parse(req.body);

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) throw new ApiError(404, 'User not found');

    // Don't let an admin lock themselves out.
    if (req.user!.id === id) {
      if (body.isActive === false) {
        throw new ApiError(400, "You can't disable your own account");
      }
      if (body.role && body.role !== 'admin') {
        throw new ApiError(400, "You can't change your own role");
      }
    }

    const data: {
      isActive?: boolean;
      role?: 'admin' | 'worker';
      passwordHash?: string;
    } = {};
    if (body.isActive !== undefined) data.isActive = body.isActive;
    if (body.role !== undefined) data.role = body.role;
    if (body.password) data.passwordHash = await hashPassword(body.password);

    const updated = await prisma.user.update({ where: { id }, data });
    res.json({ user: toPublicUser(updated) });
  }),
);

const adjustSchema = z.object({
  amount: z.number().int(),
  reason: z.string().min(1).max(200),
});

// POST /api/users/:id/credits/adjust — signed delta
router.post(
  '/:id/credits/adjust',
  asyncHandler(async (req, res) => {
    const { amount, reason } = adjustSchema.parse(req.body);
    const { user } = await adjustCredits(req.params.id, amount, reason);
    res.json({ user: toPublicUser(user) });
  }),
);

const setSchema = z.object({
  balance: z.number().int().nonnegative(),
  reason: z.string().min(1).max(200),
});

// POST /api/users/:id/credits/set — absolute balance
router.post(
  '/:id/credits/set',
  asyncHandler(async (req, res) => {
    const { balance, reason } = setSchema.parse(req.body);
    const result = await setBalance(req.params.id, balance, reason);
    res.json({ user: toPublicUser(result.user) });
  }),
);

// GET /api/users/:id/ledger — recent ledger entries
router.get(
  '/:id/ledger',
  asyncHandler(async (req, res) => {
    const entries = await prisma.ledgerEntry.findMany({
      where: { userId: req.params.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json({ entries });
  }),
);

export default router;
