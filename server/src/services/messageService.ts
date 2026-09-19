import type { Prisma, MessageStatus } from '@prisma/client';
import { prisma } from '../prisma';
import { env } from '../env';
import { ApiError } from '../middleware/error';
import { adjustCredits } from './creditService';
import { provider, statusWebhookUrl } from './providerService';
import { normalizeE164 } from '../lib/phone';

type Tx = Prisma.TransactionClient;

// Map a provider's status string onto our MessageStatus enum.
function mapStatus(s: string): MessageStatus {
  switch (s) {
    case 'delivered':
      return 'delivered';
    case 'sent':
      return 'sent';
    case 'undelivered':
      return 'undelivered';
    case 'failed':
      return 'failed';
    case 'received':
      return 'received';
    default:
      return 'queued'; // queued / sending / accepted
  }
}

// Find or create the thread for a (worker number <-> contact) pair.
async function upsertConversation(
  tx: Tx,
  workerNumberId: string,
  contactNumber: string,
) {
  return tx.conversation.upsert({
    where: {
      workerNumberId_contactNumber: { workerNumberId, contactNumber },
    },
    update: {},
    create: { workerNumberId, contactNumber },
  });
}

// Send an outbound SMS from one of the sender's numbers.
export async function sendOutbound(params: {
  senderId: string;
  fromNumberId: string;
  toNumber: string;
  body: string;
}) {
  const { senderId, fromNumberId, body } = params;

  const to = normalizeE164(params.toNumber);
  if (!to) throw new ApiError(400, 'Invalid destination number');
  if (!body || body.trim().length === 0) {
    throw new ApiError(400, 'Message body is required');
  }

  const number = await prisma.phoneNumber.findUnique({
    where: { id: fromNumberId },
  });
  if (!number || number.status !== 'active') {
    throw new ApiError(404, 'Sending number not found');
  }
  if (number.assignedUserId !== senderId) {
    throw new ApiError(403, 'That number is not assigned to you');
  }

  const cost = env.SMS_COST_CREDITS;

  // Reserve credits + persist the message atomically. If credits are
  // insufficient, adjustCredits throws and the whole transaction rolls back,
  // leaving no orphaned message.
  const message = await prisma.$transaction(async (tx) => {
    const conversation = await upsertConversation(tx, fromNumberId, to);
    const msg = await tx.message.create({
      data: {
        conversationId: conversation.id,
        direction: 'outbound',
        body,
        fromNumber: number.e164Number,
        toNumber: to,
        status: 'queued',
      },
    });
    if (cost > 0) {
      await adjustCredits(senderId, -cost, `SMS to ${to}`, {
        relatedMessageId: msg.id,
        tx,
      });
    }
    await tx.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() },
    });
    return msg;
  });

  // Hand off to the provider outside the DB transaction (no network calls
  // inside a transaction). On failure, mark failed and refund the credits.
  try {
    const result = await provider.sendSms({
      from: number.e164Number,
      to,
      body,
      statusCallbackUrl: statusWebhookUrl(),
    });
    return prisma.message.update({
      where: { id: message.id },
      data: { twilioSid: result.providerSid, status: mapStatus(result.status) },
    });
  } catch (err) {
    console.error('sendSms failed:', err);
    await prisma.$transaction(async (tx) => {
      await tx.message.update({
        where: { id: message.id },
        data: { status: 'failed', statusUpdatedAt: new Date() },
      });
      // Claim the one-shot refund guard so a later status callback can't
      // double-refund the same message.
      const claimed = await tx.message.updateMany({
        where: { id: message.id, refundedAt: null },
        data: { refundedAt: new Date() },
      });
      if (cost > 0 && claimed.count === 1) {
        await adjustCredits(senderId, cost, `Refund: failed SMS to ${to}`, {
          relatedMessageId: message.id,
          tx,
        });
      }
    });
    throw new ApiError(502, 'Failed to send message');
  }
}

// Handle an inbound SMS (from the provider webhook or the dev simulator).
// Receiving is free — no credit changes. Idempotent on providerSid so a
// retried webhook doesn't duplicate the message.
export async function handleInbound(input: {
  from: string;
  to: string;
  body: string;
  providerSid: string;
}) {
  const to = normalizeE164(input.to) ?? input.to;
  const from = normalizeE164(input.from) ?? input.from;

  const number = await prisma.phoneNumber.findUnique({
    where: { e164Number: to },
  });
  if (!number) {
    // The message is for a number we don't own — ignore it.
    return { ignored: true as const, reason: 'unknown destination number' };
  }

  if (input.providerSid) {
    const dup = await prisma.message.findUnique({
      where: { twilioSid: input.providerSid },
    });
    if (dup) return { deduped: true as const, message: dup };
  }

  const message = await prisma.$transaction(async (tx) => {
    const conversation = await upsertConversation(tx, number.id, from);
    const msg = await tx.message.create({
      data: {
        conversationId: conversation.id,
        direction: 'inbound',
        body: input.body,
        fromNumber: from,
        toNumber: to,
        twilioSid: input.providerSid || null,
        status: 'received',
      },
    });
    await tx.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() },
    });
    return msg;
  });

  return { message };
}

// Apply a delivery-status callback (from the provider webhook or the dev
// simulator). Status advances monotonically (queued → sent → delivered;
// failed/undelivered are terminal), and a terminal failure refunds the
// message's reserved credits exactly once. Idempotent for retried /
// out-of-order callbacks.
export async function handleStatusUpdate(input: {
  providerSid: string;
  status: string;
}) {
  const message = await prisma.message.findUnique({
    where: { twilioSid: input.providerSid },
  });
  if (!message) return { ignored: true as const, reason: 'unknown message SID' };

  const newStatus = mapStatus(input.status);
  const rank: Record<string, number> = { queued: 0, sent: 1, delivered: 2 };
  const isFailure = newStatus === 'failed' || newStatus === 'undelivered';
  const advances =
    isFailure || (rank[newStatus] ?? -1) > (rank[message.status] ?? -1);

  await prisma.$transaction(async (tx) => {
    if (advances) {
      await tx.message.update({
        where: { id: message.id },
        data: { status: newStatus, statusUpdatedAt: new Date() },
      });
    }
    if (isFailure) {
      // Refund exactly once by atomically claiming the guard.
      const claimed = await tx.message.updateMany({
        where: { id: message.id, refundedAt: null },
        data: { refundedAt: new Date() },
      });
      if (claimed.count === 1) {
        // Refund the exact amount originally debited for this message.
        const debit = await tx.ledgerEntry.findFirst({
          where: { relatedMessageId: message.id, amount: { lt: 0 } },
          orderBy: { createdAt: 'asc' },
        });
        if (debit) {
          await adjustCredits(
            debit.userId,
            -debit.amount,
            `Refund: ${newStatus} SMS to ${message.toNumber}`,
            { relatedMessageId: message.id, tx },
          );
        }
      }
    }
  });

  const updated = await prisma.message.findUnique({ where: { id: message.id } });
  return { message: updated };
}
