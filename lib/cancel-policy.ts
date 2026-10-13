export type CancelOutcome = "full_refund" | "credit" | "none";

export function hoursUntil(startsAt: Date, now: Date) {
  return (startsAt.getTime() - now.getTime()) / 3_600_000;
}

export function nextUpcomingStart(starts: Date[], now: Date) {
  let next: Date | null = null;
  for (const start of starts) {
    if (start.getTime() <= now.getTime()) continue;
    if (!next || start.getTime() < next.getTime()) next = start;
  }
  return next;
}

export function describedCancelOutcome(input: {
  sessionStarts: Date[];
  now: Date;
  fullRefundHours: number;
  creditOnlyHours: number;
}): CancelOutcome | "already_started" {
  const startsAt = nextUpcomingStart(input.sessionStarts, input.now);
  if (!startsAt) return "already_started";
  return studentCancelOutcome({
    now: input.now,
    startsAt,
    fullRefundHours: input.fullRefundHours,
    creditOnlyHours: input.creditOnlyHours,
  });
}

export function studentCancelOutcome(input: {
  now: Date;
  startsAt: Date;
  fullRefundHours: number;
  creditOnlyHours: number;
}): CancelOutcome {
  const hours = hoursUntil(input.startsAt, input.now);
  if (hours >= input.fullRefundHours) return "full_refund";
  if (hours >= input.creditOnlyHours) return "credit";
  return "none";
}

export function lateCancelFee(input: { outcome: CancelOutcome; lateCancelFeeCents: number }) {
  if (input.outcome !== "none") return 0;
  return Math.max(0, input.lateCancelFeeCents);
}

export function teacherRefundChoice(input: { studentOptedIntoCredit: boolean; teacherWantsCredit: boolean; creditRequiresStudentOptIn: boolean }) {
  if (!input.teacherWantsCredit) return "full_refund" as const;
  if (input.creditRequiresStudentOptIn && !input.studentOptedIntoCredit) return "full_refund" as const;
  return "credit" as const;
}

export function resolvedPolicy(platform: { fullRefundHours: number; creditOnlyHours: number; lateCancelFeeCents: number; noShowFeeCents: number }, teacher?: { fullRefundHours: number | null; creditOnlyHours: number | null; lateCancelFeeCents: number | null; noShowFeeCents: number | null } | null) {
  return {
    fullRefundHours: teacher?.fullRefundHours ?? platform.fullRefundHours,
    creditOnlyHours: teacher?.creditOnlyHours ?? platform.creditOnlyHours,
    lateCancelFeeCents: teacher?.lateCancelFeeCents ?? platform.lateCancelFeeCents,
    noShowFeeCents: teacher?.noShowFeeCents ?? platform.noShowFeeCents,
  };
}
