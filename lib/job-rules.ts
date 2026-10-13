export const JOB_MAX_ATTEMPTS = 5;
export const JOB_STALE_MINUTES = 15;

/** Queued jobs whose time has come, and running jobs whose worker disappeared. */
export function jobIsClaimable(input: { status: string; runAt: Date; lockedAt: Date | null; now: Date; attempts: number; staleMs?: number; maxAttempts?: number }) {
  const maxAttempts = input.maxAttempts ?? JOB_MAX_ATTEMPTS;
  if (input.attempts >= maxAttempts) return false;
  if (input.status === "queued") return input.runAt.getTime() <= input.now.getTime();
  if (input.status === "running") {
    const staleMs = input.staleMs ?? JOB_STALE_MINUTES * 60_000;
    if (!input.lockedAt) return true;
    return input.now.getTime() - input.lockedAt.getTime() >= staleMs;
  }
  return false;
}

export function crashedJobShouldStop(attempts: number, maxAttempts = JOB_MAX_ATTEMPTS) {
  return attempts >= maxAttempts;
}

/** A thrown job is queued again until it has been tried maxAttempts times. */
export function jobOutcomeAfterError(attempts: number, maxAttempts = JOB_MAX_ATTEMPTS) {
  if (attempts < maxAttempts) return "queued" as const;
  return "failed" as const;
}

export function jobRetryDelayMs(attempts: number) {
  const step = Math.max(0, attempts - 1);
  return Math.min(60 * 60 * 1000, 30_000 * 2 ** step);
}
