import { describe, expect, it } from "vitest";
import {
  appointmentConflicts,
  canTakeSeat,
  extraMinutesThatFit,
  generateOpenSlots,
  needsWaiver,
  seatsLeft,
  withinCancellationWindow,
} from "@/lib/slots";

const monday = new Date("2026-10-12T15:00:00Z");

describe("appointment slot generation", () => {
  it("steps through a weekly window by duration plus buffer", () => {
    const slots = generateOpenSlots({
      windows: [{ weekday: 1, start: "09:00", end: "12:00" }],
      durationMinutes: 60,
      bufferMinutes: 15,
      from: monday,
      days: 1,
      now: new Date("2026-10-12T08:00:00Z"),
      leadTimeHours: 0,
      timeZone: "UTC",
    });
    expect(slots.map((slot) => slot.time)).toEqual(["09:00", "10:15"]);
  });

  it("hides slots inside the booking lead time", () => {
    const slots = generateOpenSlots({
      windows: [{ weekday: 1, start: "09:00", end: "12:00" }],
      durationMinutes: 60,
      bufferMinutes: 0,
      from: monday,
      days: 1,
      now: new Date("2026-10-12T08:00:00Z"),
      leadTimeHours: 2,
      timeZone: "UTC",
    });
    expect(slots.map((slot) => slot.time)).toEqual(["10:00", "11:00"]);
  });
});

describe("double booking", () => {
  it("treats a buffered overlap as taken and leaves a later gap open", () => {
    const busy = [{ startsAt: new Date("2026-10-12T09:00:00Z"), endsAt: new Date("2026-10-12T10:00:00Z") }];
    const next = { startsAt: new Date("2026-10-12T10:00:00Z"), endsAt: new Date("2026-10-12T11:00:00Z") };
    const later = { startsAt: new Date("2026-10-12T10:15:00Z"), endsAt: new Date("2026-10-12T11:15:00Z") };
    expect(appointmentConflicts(next, busy, 15)).toBe(true);
    expect(appointmentConflicts(later, busy, 15)).toBe(false);
    const slots = generateOpenSlots({
      windows: [{ weekday: 1, start: "09:00", end: "12:00" }],
      durationMinutes: 60,
      bufferMinutes: 15,
      from: monday,
      days: 1,
      now: new Date("2026-10-12T08:00:00Z"),
      leadTimeHours: 0,
      busy,
      timeZone: "UTC",
    });
    expect(slots.map((slot) => slot.time)).toEqual(["10:15"]);
  });

  it("keeps extra minutes inside the window and before the next booking", () => {
    const slots = generateOpenSlots({
      windows: [{ weekday: 1, start: "09:00", end: "12:00" }],
      durationMinutes: 60,
      bufferMinutes: 0,
      from: monday,
      days: 1,
      now: new Date("2026-10-12T08:00:00Z"),
      leadTimeHours: 0,
      timeZone: "UTC",
    });
    expect(slots.find((slot) => slot.time === "09:00")?.slackMinutes).toBe(120);
    expect(slots.find((slot) => slot.time === "11:00")?.slackMinutes).toBe(0);
    const busy = [{ startsAt: new Date("2026-10-12T10:30:00Z"), endsAt: new Date("2026-10-12T11:30:00Z") }];
    const beforeBusy = generateOpenSlots({
      windows: [{ weekday: 1, start: "09:00", end: "13:00" }],
      durationMinutes: 60,
      bufferMinutes: 0,
      from: monday,
      days: 1,
      now: new Date("2026-10-12T08:00:00Z"),
      leadTimeHours: 0,
      busy,
      timeZone: "UTC",
    });
    expect(beforeBusy.find((slot) => slot.time === "09:00")?.slackMinutes).toBe(30);
    expect(beforeBusy.some((slot) => slot.time === "10:00")).toBe(false);
    expect(extraMinutesThatFit(
      new Date("2026-10-12T09:00:00Z"),
      new Date("2026-10-12T10:00:00Z"),
      new Date("2026-10-12T12:00:00Z"),
      15,
      [{ startsAt: new Date("2026-10-12T10:30:00Z"), endsAt: new Date("2026-10-12T11:30:00Z") }],
    )).toBe(15);
  });
});

describe("capacity slots", () => {
  it("counts remaining seats and stops at capacity", () => {
    expect(seatsLeft(6, 2)).toBe(4);
    expect(canTakeSeat(6, 5)).toBe(true);
    expect(canTakeSeat(6, 6)).toBe(false);
  });
});

describe("waivers", () => {
  it("asks for a signature once per current version", () => {
    expect(needsWaiver({ required: true, currentVersion: 2, signedVersion: null })).toBe(true);
    expect(needsWaiver({ required: true, currentVersion: 2, signedVersion: 1 })).toBe(true);
    expect(needsWaiver({ required: true, currentVersion: 2, signedVersion: 2 })).toBe(false);
    expect(needsWaiver({ required: false, currentVersion: 2, signedVersion: null })).toBe(false);
    expect(needsWaiver({ required: true, currentVersion: null, signedVersion: null })).toBe(true);
  });

  it("allows cancellation only before the window closes", () => {
    const starts = new Date("2026-10-20T18:00:00Z");
    expect(withinCancellationWindow(starts, new Date("2026-10-19T17:00:00Z"), 24)).toBe(true);
    expect(withinCancellationWindow(starts, new Date("2026-10-19T19:00:00Z"), 24)).toBe(false);
  });
});
