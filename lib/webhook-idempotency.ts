export function webhookShouldProcess(input: { eventId: string; alreadyStored: boolean }) {
  return input.eventId.length > 0 && !input.alreadyStored;
}

/** A claimed event that throws must be released so Stripe's retry runs the work again. */
export function webhookClaimShouldRelease(input: { claimed: boolean; failed: boolean }) {
  return input.claimed && input.failed;
}

/** Stripe fires charge.refunded for partial refunds too. Only a fully refunded charge releases every seat. */
export function chargeRefundReleasesSeats(fullyRefunded: boolean) {
  return fullyRefunded;
}

export function duplicateChargeBlocked(input: { existingPaid: boolean; existingPending: boolean }) {
  return input.existingPaid || input.existingPending;
}
