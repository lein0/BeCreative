const DEFAULT_HOLD_MINUTES = 30;

export function checkoutHoldMinutes(raw = process.env.CHECKOUT_HOLD_MINUTES): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_HOLD_MINUTES;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_HOLD_MINUTES;
  return Math.floor(parsed);
}

export function checkoutHoldCutoff(now: Date, minutes = checkoutHoldMinutes()): Date {
  return new Date(now.getTime() - minutes * 60_000);
}

export function isCheckoutHoldExpired(createdAt: Date, now: Date, minutes = checkoutHoldMinutes()): boolean {
  return now.getTime() - createdAt.getTime() >= minutes * 60_000;
}
