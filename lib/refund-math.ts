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

/** Ledger keys are colon-separated. The session id is its own segment. */
export function refundLedgerMatchesSession(idempotencyKey: string, sessionId: string) {
  return Boolean(sessionId) && idempotencyKey.split(":").includes(sessionId);
}

/** A posted refund is done. Failed and in-flight card refunds can be submitted again. */
export function teacherRefundStillOpen(status: string) {
  return status === "failed" || status === "pending";
}

/** The date is already cancelled, so a later submit only retries the card refund. */
export function teacherCancelRetriesRefundOnly(sessionStatus: string) {
  return sessionStatus === "cancelled";
}

/**
 * Dates the teacher already cancelled were prorated then. A student cancel refunds only the dates still on the books.
 * sessionCount stays the original series length so the share matches the first proration.
 */
export function studentCancelRefundCounts(sessions: { startsAt: Date; status: string }[], now: Date) {
  const future = sessions.filter((session) => session.startsAt.getTime() > now.getTime());
  const refundable = future
    .filter((session) => session.status !== "cancelled")
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  return {
    hasFuture: future.length > 0,
    sessionCount: Math.max(1, sessions.length),
    cancelledCount: refundable.length,
    refundAnchor: refundable[0]?.startsAt ?? null,
  };
}

/** A full posted refund gives back studio credit that was spent on the order. A partial refund does not. */
export function studioCreditRestoreForPostedRefund(input: { full: boolean; orderId: string }) {
  if (!input.full) return null;
  return { scope: `refund-${input.orderId}`, sessionCount: 1, cancelledCount: 1, closeRemainder: true as const };
}

/** An unpaid hold that times out never charged the card, so the spend comes back the same way an abandoned checkout does. */
export function expiredHoldStudioCreditRestore() {
  return { scope: "expired", sessionCount: 1, cancelledCount: 1, closeRemainder: true as const };
}

/** A series stays confirmed while any linked date is still scheduled. */
export function seriesBookingCloses(input: { kind: string; remainingStatuses: string[]; linkedRemaining: number }) {
  if (input.kind === "session") return true;
  if (input.remainingStatuses.length < input.linkedRemaining) return false;
  return input.remainingStatuses.every((status) => status === "cancelled");
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
  if (input.pendingMarker?.startsWith("reserved:")) return input.pendingMarker.slice("reserved:".length);
  return input.ledgerKey;
}

export function pendingStripeMarker(stripeKey: string) {
  return `pending:${stripeKey}`;
}

export function reservedStripeMarker(stripeKey: string) {
  return `reserved:${stripeKey}`;
}

/** Cash was added to refundedCents before the Stripe call, so a retry must not add it again. */
export function refundCashAlreadyReserved(marker: string | null | undefined) {
  return Boolean(marker?.startsWith("reserved:"));
}

/**
 * Add onto the current counter. A stale snapshot must not replace a newer total,
 * and the add is refused when it would pass the amount the student paid.
 */
export function refundedTotalAfterReserve(currentCents: number, amountCents: number, studentPaysCents: number) {
  const current = Math.max(0, Math.trunc(currentCents));
  const amount = Math.trunc(amountCents);
  const paid = Math.max(0, Math.trunc(studentPaysCents));
  if (amount <= 0) return current;
  if (current + amount > paid) return null;
  return current + amount;
}

/** A card charge is posted only after Stripe returns a refund id. Offline is only for orders with no payment intent. */
export function refundLedgerStatus(input: { amountCents: number; hasPaymentIntent: boolean; stripeRefundId: string | null }) {
  if (input.amountCents <= 0) return "posted" as const;
  if (!input.hasPaymentIntent) return "offline" as const;
  if (input.stripeRefundId) return "posted" as const;
  return "failed" as const;
}

/** Stripe failures keep the seat so the student can retry. An empty balance does not. */
export function refundFailureKeepsSeat(error: string | undefined) {
  if (!error) return false;
  if (error === "Nothing left to refund.") return false;
  if (error === "Order not found.") return false;
  if (error === "Refund is already in progress.") return false;
  return true;
}

export function entitlementRestoreKey(bookingId: string, sessionId: string) {
  return `restore:${bookingId}:${sessionId}`;
}

export function sessionIdFromEntitlementRestore(sourceId: string, bookingId: string) {
  const prefix = `restore:${bookingId}:`;
  if (!sourceId.startsWith(prefix)) return null;
  const sessionId = sourceId.slice(prefix.length);
  if (!sessionId || sessionId.includes(":")) return null;
  return sessionId;
}

/** Sessions a later cancel still needs to restore. Dates restored by an earlier teacher cancel are excluded. */
export function sessionsStillNeedingRestore(input: { refundableSessionIds: string[]; restoredSessionIds: string[] }) {
  const restored = new Set(input.restoredSessionIds);
  return input.refundableSessionIds.filter((id) => !restored.has(id));
}

/** Intro comes back when the booking closes and every date is still in the future. */
export function introRestoresWhenBookingCloses(input: { closesBooking: boolean; everySessionStillAhead: boolean }) {
  return input.closesBooking && input.everySessionStillAhead;
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
