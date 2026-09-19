import { Router } from 'express';
import { z } from 'zod';
import { env } from '../env';
import { prisma } from '../prisma';
import { asyncHandler, ApiError } from '../middleware/error';
import { authenticate } from '../middleware/auth';
import { handleInbound, handleStatusUpdate } from '../services/messageService';

// Dev-only helpers so the app can be demoed end-to-end without Twilio.
const router = Router();

router.use(authenticate);

const schema = z.object({
  toNumber: z.string().min(3), // one of our provisioned numbers
  fromNumber: z.string().min(3), // the external contact
  body: z.string().min(1).max(1600),
});

// POST /api/dev/simulate-inbound — pretend an SMS arrived at one of our numbers.
router.post(
  '/simulate-inbound',
  asyncHandler(async (req, res) => {
    if (env.NODE_ENV === 'production') {
      throw new ApiError(403, 'Disabled in production');
    }
    const { toNumber, fromNumber, body } = schema.parse(req.body);
    const result = await handleInbound({
      to: toNumber,
      from: fromNumber,
      body,
      providerSid: `SMsim${Date.now()}${Math.floor(Math.random() * 1000)}`,
    });
    res.json(result);
  }),
);

const statusSchema = z.object({
  messageId: z.string().min(1),
  status: z.enum(['queued', 'sent', 'delivered', 'failed', 'undelivered']),
});

// POST /api/dev/simulate-status — drive an outbound message's delivery status
// without Twilio (local/mock testing of the lifecycle + refund-on-failure).
router.post(
  '/simulate-status',
  asyncHandler(async (req, res) => {
    if (env.NODE_ENV === 'production') {
      throw new ApiError(403, 'Disabled in production');
    }
    const { messageId, status } = statusSchema.parse(req.body);
    const msg = await prisma.message.findUnique({ where: { id: messageId } });
    if (!msg?.twilioSid) {
      throw new ApiError(404, 'Message not found or has no provider SID');
    }
    const result = await handleStatusUpdate({
      providerSid: msg.twilioSid,
      status,
    });
    res.json(result);
  }),
);

export default router;
