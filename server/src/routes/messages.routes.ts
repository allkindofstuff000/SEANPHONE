import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/error';
import { authenticate } from '../middleware/auth';
import { sendOutbound } from '../services/messageService';

const router = Router();

router.use(authenticate);

const sendSchema = z.object({
  fromNumberId: z.string().min(1),
  toNumber: z.string().min(3),
  body: z.string().min(1).max(1600),
});

// POST /api/messages — send an outbound SMS
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { fromNumberId, toNumber, body } = sendSchema.parse(req.body);
    const message = await sendOutbound({
      senderId: req.user!.id,
      fromNumberId,
      toNumber,
      body,
    });
    res.status(201).json({ message });
  }),
);

export default router;
