import type { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { ApiError } from '../middleware/error';

type Tx = Prisma.TransactionClient;

// The ONLY place credit balances change. Every adjustment writes a LedgerEntry
// in the same transaction, so the balance and its audit trail can never diverge.
async function applyAdjustment(
  tx: Tx,
  userId: string,
  amount: number,
  reason: string,
  relatedMessageId?: string,
) {
  if (!Number.isInteger(amount)) throw new ApiError(400, 'amount must be an integer');
  if (amount === 0) throw new ApiError(400, 'amount must be non-zero');

  if (amount < 0) {
    // Conditional decrement: only succeeds if the balance is high enough.
    // This is atomic at the DB level, so two concurrent debits can't oversell.
    const need = -amount;
    const result = await tx.user.updateMany({
      where: { id: userId, creditBalance: { gte: need } },
      data: { creditBalance: { increment: amount } },
    });
    if (result.count === 0) {
      const exists = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });
      if (!exists) throw new ApiError(404, 'User not found');
      throw new ApiError(400, 'Insufficient credits');
    }
  } else {
    const exists = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!exists) throw new ApiError(404, 'User not found');
    await tx.user.update({
      where: { id: userId },
      data: { creditBalance: { increment: amount } },
    });
  }

  const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
  const entry = await tx.ledgerEntry.create({
    data: {
      userId,
      amount,
      reason,
      relatedMessageId: relatedMessageId ?? null,
      balanceAfter: user.creditBalance,
    },
  });
  return { user, entry };
}

// Adjust a balance by a signed delta (positive = credit, negative = debit).
// Pass an existing `tx` to run inside a larger transaction (e.g. sending an SMS
// deducts credits and links the ledger entry to the message atomically).
export function adjustCredits(
  userId: string,
  amount: number,
  reason: string,
  opts?: { relatedMessageId?: string; tx?: Tx },
) {
  if (opts?.tx) {
    return applyAdjustment(opts.tx, userId, amount, reason, opts.relatedMessageId);
  }
  return prisma.$transaction((tx) =>
    applyAdjustment(tx, userId, amount, reason, opts?.relatedMessageId),
  );
}

// Set an absolute balance; records the difference as a ledger entry.
export function setBalance(userId: string, target: number, reason: string) {
  if (!Number.isInteger(target) || target < 0) {
    throw new ApiError(400, 'balance must be a non-negative integer');
  }
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw new ApiError(404, 'User not found');
    const delta = target - user.creditBalance;
    if (delta === 0) return { user, entry: null };
    return applyAdjustment(tx, userId, delta, reason);
  });
}
