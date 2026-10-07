export type SessionState = "scheduled" | "cancelled" | "completed" | "paused";

export type BookingDecision =
  | { ok: true; status: "confirmed" }
  | { ok: true; status: "waitlisted" }
  | { ok: false; reason: "full" | "cancelled_session" | "paused" | "past" | "already_booked" | "completed" };

export function spotsRemaining(capacity: number, confirmedCount: number): number {
  return Math.max(0, capacity - confirmedCount);
}

export function decideBooking(input: {
  now: Date;
  sessionStartsAt: Date;
  sessionStatus: SessionState;
  capacity: number;
  confirmedCount: number;
  waitlistEnabled: boolean;
  alreadyBooked: boolean;
  allowPast?: boolean;
}): BookingDecision {
  if (input.alreadyBooked) return { ok: false, reason: "already_booked" };
  if (input.sessionStatus === "cancelled") return { ok: false, reason: "cancelled_session" };
  if (input.sessionStatus === "paused") return { ok: false, reason: "paused" };
  if (input.sessionStatus === "completed") return { ok: false, reason: "completed" };
  if (!input.allowPast && input.sessionStartsAt.getTime() <= input.now.getTime()) return { ok: false, reason: "past" };
  if (spotsRemaining(input.capacity, input.confirmedCount) > 0) return { ok: true, status: "confirmed" };
  if (input.waitlistEnabled) return { ok: true, status: "waitlisted" };
  return { ok: false, reason: "full" };
}

export function decideSeriesBooking(
  sessions: Array<{ id: string; startsAt: Date; status: SessionState; capacity: number; confirmedCount: number }>,
  now: Date,
): { ok: true; sessionIds: string[] } | { ok: false; reason: string; sessionId?: string } {
  const future = sessions.filter((session) => session.status === "scheduled" && session.startsAt.getTime() > now.getTime());
  if (!future.length) return { ok: false, reason: "This series has no upcoming sessions." };
  for (const session of future) {
    if (spotsRemaining(session.capacity, session.confirmedCount) < 1) {
      return { ok: false, reason: "One of the sessions in this series is full.", sessionId: session.id };
    }
  }
  return { ok: true, sessionIds: future.map((session) => session.id) };
}
