import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { asyncHandler, ApiError } from '../middleware/error';
import { authenticate, requireRole } from '../middleware/auth';
import { provider, smsWebhookUrl } from '../services/providerService';

const router = Router();

router.use(authenticate);

// Midnight of "today" in UTC+6, expressed as a real UTC Date (the dashboard's
// "MSGS TODAY" is counted against a UTC+6 day).
function startOfTodayUtc6(): Date {
  const shifted = new Date(Date.now() + 6 * 3600 * 1000);
  const startShiftedUtcMs = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
  );
  return new Date(startShiftedUtcMs - 6 * 3600 * 1000);
}

// GET /api/numbers — admin sees all; a worker sees only numbers assigned to them.
// Each number is enriched with dashboard fields: operationalStatus (ACTIVE/IDLE),
// messagesToday, and lastActivityAt.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const where =
      req.user!.role === 'admin' ? {} : { assignedUserId: req.user!.id };
    const numbers = await prisma.phoneNumber.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { assignedUser: { select: { id: true, email: true } } },
    });

    const todayStart = startOfTodayUtc6();
    const enriched = await Promise.all(
      numbers.map(async (n) => {
        const [messagesToday, last] = await Promise.all([
          prisma.message.count({
            where: {
              conversation: { workerNumberId: n.id },
              createdAt: { gte: todayStart },
            },
          }),
          prisma.message.findFirst({
            where: { conversation: { workerNumberId: n.id } },
            orderBy: { createdAt: 'desc' },
            select: { createdAt: true },
          }),
        ]);
        // Operational status for the grid: released numbers are inactive;
        // an assigned number is ACTIVE, an unassigned one is IDLE.
        const operationalStatus =
          n.status === 'released'
            ? 'released'
            : n.assignedUserId
              ? 'active'
              : 'idle';
        return {
          id: n.id,
          e164Number: n.e164Number,
          twilioSid: n.twilioSid,
          status: n.status,
          operationalStatus,
          assignedUserId: n.assignedUserId,
          assignedUser: n.assignedUser,
          messagesToday,
          lastActivityAt: last?.createdAt ?? null,
          createdAt: n.createdAt,
        };
      }),
    );

    res.json({ numbers: enriched });
  }),
);

// ----- Admin-only below -----
router.use(requireRole('admin'));

const searchSchema = z.object({
  areaCode: z
    .string()
    .regex(/^\d{3}$/, 'areaCode must be 3 digits')
    .optional(),
  contains: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(30).optional(),
});

// GET /api/numbers/available?areaCode=415 — search purchasable numbers
router.get(
  '/available',
  asyncHandler(async (req, res) => {
    const q = searchSchema.parse(req.query);
    const numbers = await provider.searchNumbers(q);
    res.json({ provider: provider.name, numbers });
  }),
);

const buySchema = z.object({ e164Number: z.string().min(5) });

// POST /api/numbers — purchase/provision a number and set its SMS webhook
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { e164Number } = buySchema.parse(req.body);

    const existing = await prisma.phoneNumber.findUnique({
      where: { e164Number },
    });
    if (existing) throw new ApiError(409, 'Number already provisioned');

    const bought = await provider.buyNumber(e164Number, {
      smsWebhookUrl: smsWebhookUrl(),
    });

    const number = await prisma.phoneNumber.create({
      data: {
        e164Number: bought.e164Number,
        twilioSid: bought.providerSid,
        status: 'active',
      },
    });
    res.status(201).json({ number });
  }),
);

const assignSchema = z.object({ userId: z.string().nullable() });

// POST /api/numbers/:id/assign — assign to a worker (or null to unassign)
router.post(
  '/:id/assign',
  asyncHandler(async (req, res) => {
    const { userId } = assignSchema.parse(req.body);

    const number = await prisma.phoneNumber.findUnique({
      where: { id: req.params.id },
    });
    if (!number) throw new ApiError(404, 'Number not found');

    if (userId) {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw new ApiError(404, 'User not found');
    }

    const updated = await prisma.phoneNumber.update({
      where: { id: req.params.id },
      data: { assignedUserId: userId },
      include: { assignedUser: { select: { id: true, email: true } } },
    });
    res.json({ number: updated });
  }),
);

// POST /api/numbers/:id/release — release a number (best-effort at the provider)
router.post(
  '/:id/release',
  asyncHandler(async (req, res) => {
    const number = await prisma.phoneNumber.findUnique({
      where: { id: req.params.id },
    });
    if (!number) throw new ApiError(404, 'Number not found');

    if (number.twilioSid) {
      try {
        await provider.releaseNumber(number.twilioSid);
      } catch {
        // best effort — still mark released locally
      }
    }

    const updated = await prisma.phoneNumber.update({
      where: { id: req.params.id },
      data: { status: 'released', assignedUserId: null },
    });
    res.json({ number: updated });
  }),
);

export default router;
