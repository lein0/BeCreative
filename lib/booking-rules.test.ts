import { describe, expect, it } from "vitest";
import { decideBooking, decideSeriesBooking, spotsRemaining } from "@/lib/booking-rules";

const now = new Date("2026-10-07T18:00:00Z");
const future = new Date("2026-10-20T02:00:00Z");

describe("capacity", () => {
  it("confirms a seat, waitlists a full class, and blocks a second booking", () => {
    expect(spotsRemaining(12, 9)).toBe(3);
    expect(decideBooking({ now, sessionStartsAt: future, sessionStatus: "scheduled", capacity: 12, confirmedCount: 9, waitlistEnabled: true, alreadyBooked: false })).toEqual({ ok: true, status: "confirmed" });
    expect(decideBooking({ now, sessionStartsAt: future, sessionStatus: "scheduled", capacity: 12, confirmedCount: 12, waitlistEnabled: true, alreadyBooked: false })).toEqual({ ok: true, status: "waitlisted" });
    expect(decideBooking({ now, sessionStartsAt: future, sessionStatus: "scheduled", capacity: 12, confirmedCount: 12, waitlistEnabled: false, alreadyBooked: false }).ok).toBe(false);
    expect(decideBooking({ now, sessionStartsAt: future, sessionStatus: "scheduled", capacity: 12, confirmedCount: 1, waitlistEnabled: false, alreadyBooked: true })).toEqual({ ok: false, reason: "already_booked" });
    expect(decideBooking({ now, sessionStartsAt: future, sessionStatus: "paused", capacity: 12, confirmedCount: 0, waitlistEnabled: false, alreadyBooked: false })).toEqual({ ok: false, reason: "paused" });
  });

  it("requires every upcoming session in a series to have room", () => {
    const sessions = [
      { id: "a", startsAt: future, status: "scheduled" as const, capacity: 10, confirmedCount: 10 },
      { id: "b", startsAt: new Date("2026-10-27T02:00:00Z"), status: "scheduled" as const, capacity: 10, confirmedCount: 2 },
    ];
    expect(decideSeriesBooking(sessions, now).ok).toBe(false);
    expect(decideSeriesBooking([{ ...sessions[0], confirmedCount: 3 }, sessions[1]], now)).toEqual({ ok: true, sessionIds: ["a", "b"] });
  });
});
