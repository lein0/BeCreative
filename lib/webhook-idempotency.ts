export function webhookShouldProcess(input: { eventId: string; alreadyStored: boolean }) {
  return input.eventId.length > 0 && !input.alreadyStored;
}

export function duplicateChargeBlocked(input: { existingPaid: boolean; existingPending: boolean }) {
  return input.existingPaid || input.existingPending;
}
