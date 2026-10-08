export function seriesProrate(input: {
  studentPaysCents: number;
  platformFeeCents: number;
  teacherAmountCents: number;
  sessionCount: number;
  cancelledCount: number;
  alreadyRefundedCents: number;
}) {
  const sessions = Math.max(0, input.sessionCount);
  const cancelled = Math.max(0, Math.min(input.cancelledCount, sessions));
  if (sessions === 0 || cancelled === 0 || input.studentPaysCents <= 0) {
    return { refundCents: 0, feeReversedCents: 0, transferReversedCents: 0, full: false };
  }
  const share = cancelled / sessions;
  const target = Math.round(input.studentPaysCents * share);
  const refundCents = Math.max(0, Math.min(input.studentPaysCents - Math.max(0, input.alreadyRefundedCents), target));
  const feeReversedCents = Math.round(input.platformFeeCents * (refundCents / input.studentPaysCents));
  const transferReversedCents = Math.round(input.teacherAmountCents * (refundCents / input.studentPaysCents));
  const full = input.alreadyRefundedCents + refundCents >= input.studentPaysCents;
  return { refundCents, feeReversedCents, transferReversedCents, full };
}

export function promoReversesOnRefund(input: { refundCents: number; studentPaysCents: number; alreadyRefundedCents: number }) {
  if (input.studentPaysCents <= 0) return input.refundCents > 0;
  return input.alreadyRefundedCents + input.refundCents >= input.studentPaysCents;
}

export function packCreditsToRestore(input: { creditsConsumed: number; cancelledSessions: number; sessionCount: number }) {
  if (input.sessionCount <= 0 || input.creditsConsumed <= 0 || input.cancelledSessions <= 0) return 0;
  return Math.min(input.creditsConsumed, input.cancelledSessions);
}

export function refundIdempotencyKey(orderId: string, amountCents: number, reason: string, scope = "") {
  return scope ? `refund:${orderId}:${scope}:${amountCents}:${reason}` : `refund:${orderId}:${amountCents}:${reason}`;
}

export function partialRefundRemaining(studentPaysCents: number, alreadyRefundedCents: number, requestedCents: number) {
  const remaining = Math.max(0, studentPaysCents - alreadyRefundedCents);
  return Math.max(0, Math.min(remaining, requestedCents));
}
