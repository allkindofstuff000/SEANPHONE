import { Router } from 'express';
import { z } from 'zod';
import { env } from '../env';
import { asyncHandler, ApiError } from '../middleware/error';
import { authenticate } from '../middleware/auth';
import { handleInbound } from '../services/messageService';

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

export default router;
