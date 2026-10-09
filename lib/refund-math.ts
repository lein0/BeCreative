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

/** A successful submit clears the key. An error redirect keeps it so the retry is the same refund. */
export function nextAdminRefundKey(input: { stored: string | null; succeeded: boolean; minted: string }) {
  if (input.succeeded || !input.stored?.trim()) return input.minted;
  return input.stored.trim();
}

/** Same admin submit (double click or refresh) must reuse one ledger key. A blank key stays stable. */
export function adminRefundScope(idempotencyKey: string | null | undefined) {
  const key = (idempotencyKey ?? "").trim();
  return key ? `admin:${key}` : "admin";
}

/** Pending and failed rows are not a completed refund. Replaying them must not report success. */
export function refundReplayIsSuccess(status: string) {
  return status === "posted" || status === "offline";
}

/**
 * Reuse the key stored before the Stripe call when a pending attempt is retried.
 * A recorded Stripe failure needs a new key because Stripe caches the error on the old one.
 */
export function nextStripeRefundKey(input: { ledgerKey: string; status: string; pendingMarker: string | null; retryNonce: string }) {
  if (input.status === "failed") return `${input.ledgerKey}:r:${input.retryNonce}`;
  if (input.pendingMarker?.startsWith("pending:")) return input.pendingMarker.slice("pending:".length);
  return input.ledgerKey;
}

export function pendingStripeMarker(stripeKey: string) {
  return `pending:${stripeKey}`;
}

/** Credit already spent comes back when a cancellation would have refunded cash. A finished booking returns whatever is left. */
export function studioCreditRestoreCents(input: { appliedCents: number; sessionCount: number; cancelledCount: number; alreadyRestoredCents: number; closeRemainder: boolean }) {
  const applied = Math.max(0, Math.trunc(input.appliedCents));
  const already = Math.max(0, Math.trunc(input.alreadyRestoredCents));
  const left = Math.max(0, applied - already);
  if (left === 0) return 0;
  if (input.closeRemainder) return left;
  const sessions = Math.max(1, input.sessionCount);
  const cancelled = Math.max(0, Math.min(Math.trunc(input.cancelledCount), sessions));
  if (cancelled === 0) return 0;
  return Math.min(left, Math.round((applied * cancelled) / sessions));
}

export function applyStudioCredit(input: { balanceCents: number; priceCents: number }) {
  const balance = Math.max(0, Math.trunc(input.balanceCents));
  const price = Math.max(0, Math.trunc(input.priceCents));
  const appliedCents = Math.min(balance, price);
  return { appliedCents, remainderCents: price - appliedCents };
}

export function studioCreditLedgerSource(orderId: string, appliedCents: number) {
  return `order:${orderId}:${appliedCents}`;
}

export function parseStudioCreditLedgerSource(sourceId: string) {
  const match = /^order:([^:]+):(\d+)$/.exec(sourceId);
  if (!match) return null;
  const appliedCents = Number(match[2]);
  if (!Number.isInteger(appliedCents) || appliedCents <= 0) return null;
  return { orderId: match[1]!, appliedCents };
}

export function partialRefundRemaining(studentPaysCents: number, alreadyRefundedCents: number, requestedCents: number) {
  const remaining = Math.max(0, studentPaysCents - alreadyRefundedCents);
  return Math.max(0, Math.min(remaining, requestedCents));
}
