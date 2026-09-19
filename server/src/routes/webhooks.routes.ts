import { Router } from 'express';
import {
  provider,
  smsWebhookUrl,
  statusWebhookUrl,
} from '../services/providerService';
import { handleInbound, handleStatusUpdate } from '../services/messageService';
import { asyncHandler } from '../middleware/error';

const router = Router();

// POST /webhooks/twilio/sms — inbound SMS from the provider.
// NOTE: mounted OUTSIDE /api. Twilio's signature is validated here so the
// endpoint can't be spoofed (the mock provider accepts anything in dev).
router.post(
  '/twilio/sms',
  asyncHandler(async (req, res) => {
    const signature = req.header('X-Twilio-Signature') ?? undefined;
    // Prefer the configured public URL (Twilio signs against the exact URL it
    // was given); fall back to the request URL for local/mock use.
    const url =
      smsWebhookUrl() ?? `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    const params = (req.body ?? {}) as Record<string, unknown>;

    if (!provider.validateInbound({ signature, url, params })) {
      return res.status(403).type('text/xml').send('<Response></Response>');
    }

    const parsed = provider.parseInbound(params);
    await handleInbound(parsed);

    // Empty TwiML — we don't auto-reply (the AI bot will hook in here later).
    res
      .type('text/xml')
      .send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  }),
);

// POST /webhooks/twilio/status — outbound delivery-status callbacks.
// Signature-validated the same way as inbound.
router.post(
  '/twilio/status',
  asyncHandler(async (req, res) => {
    const signature = req.header('X-Twilio-Signature') ?? undefined;
    const url =
      statusWebhookUrl() ??
      `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    const params = (req.body ?? {}) as Record<string, unknown>;

    if (!provider.validateInbound({ signature, url, params })) {
      return res.status(403).type('text/xml').send('<Response></Response>');
    }

    const update = provider.parseStatus(params);
    if (update.providerSid) await handleStatusUpdate(update);

    res
      .type('text/xml')
      .send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  }),
);

export default router;
