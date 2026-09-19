import { Router } from 'express';
import type { Role } from '@prisma/client';
import { prisma } from '../prisma';
import { asyncHandler, ApiError } from '../middleware/error';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

// Returns the phone-number ids a user may see, or null for "all" (admin).
async function visibleNumberIds(user: { id: string; role: Role }) {
  if (user.role === 'admin') return null;
  const nums = await prisma.phoneNumber.findMany({
    where: { assignedUserId: user.id },
    select: { id: true },
  });
  return nums.map((n) => n.id);
}

// GET /api/conversations — list threads (newest activity first)
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const ids = await visibleNumberIds(req.user!);
    const where = ids === null ? {} : { workerNumberId: { in: ids } };

    const conversations = await prisma.conversation.findMany({
      where,
      orderBy: { lastMessageAt: 'desc' },
      include: {
        workerNumber: {
          select: {
            id: true,
            e164Number: true,
            assignedUserId: true,
            assignedUser: { select: { id: true, email: true } },
          },
        },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        _count: { select: { messages: true } },
      },
    });

    const result = conversations.map((c) => {
      const last = c.messages[0] ?? null;
      // Unread when the newest message is inbound and arrived after the last read.
      const unread = !!(
        last &&
        last.direction === 'inbound' &&
        (!c.lastReadAt || last.createdAt > c.lastReadAt)
      );
      return {
        id: c.id,
        contactNumber: c.contactNumber,
        workerNumber: {
          id: c.workerNumber.id,
          e164Number: c.workerNumber.e164Number,
          assignedUserId: c.workerNumber.assignedUserId,
        },
        assignedWorker: c.workerNumber.assignedUser
          ? {
              id: c.workerNumber.assignedUser.id,
              email: c.workerNumber.assignedUser.email,
            }
          : null,
        lastMessageAt: c.lastMessageAt,
        lastReadAt: c.lastReadAt,
        unread,
        messageCount: c._count.messages,
        lastMessage: last
          ? { body: last.body, direction: last.direction, createdAt: last.createdAt }
          : null,
      };
    });

    res.json({ conversations: result });
  }),
);

// GET /api/conversations/:id — full thread
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const convo = await prisma.conversation.findUnique({
      where: { id: req.params.id },
      include: {
        workerNumber: {
          select: {
            id: true,
            e164Number: true,
            assignedUserId: true,
            assignedUser: { select: { id: true, email: true } },
          },
        },
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!convo) throw new ApiError(404, 'Conversation not found');

    if (
      req.user!.role !== 'admin' &&
      convo.workerNumber.assignedUserId !== req.user!.id
    ) {
      throw new ApiError(403, 'Forbidden');
    }

    res.json({
      conversation: {
        id: convo.id,
        contactNumber: convo.contactNumber,
        workerNumber: {
          id: convo.workerNumber.id,
          e164Number: convo.workerNumber.e164Number,
          assignedUserId: convo.workerNumber.assignedUserId,
        },
        assignedWorker: convo.workerNumber.assignedUser
          ? {
              id: convo.workerNumber.assignedUser.id,
              email: convo.workerNumber.assignedUser.email,
            }
          : null,
        lastMessageAt: convo.lastMessageAt,
        lastReadAt: convo.lastReadAt,
        messages: convo.messages,
      },
    });
  }),
);

// PATCH /api/conversations/:id/read — mark thread read
router.patch(
  '/:id/read',
  asyncHandler(async (req, res) => {
    const convo = await prisma.conversation.findUnique({
      where: { id: req.params.id },
      include: { workerNumber: { select: { assignedUserId: true } } },
    });
    if (!convo) throw new ApiError(404, 'Conversation not found');
    if (
      req.user!.role !== 'admin' &&
      convo.workerNumber.assignedUserId !== req.user!.id
    ) {
      throw new ApiError(403, 'Forbidden');
    }
    const updated = await prisma.conversation.update({
      where: { id: req.params.id },
      data: { lastReadAt: new Date() },
    });
    res.json({ ok: true, lastReadAt: updated.lastReadAt });
  }),
);

export default router;
