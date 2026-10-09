import { describe, expect, it } from "vitest";
import { needsWaiver } from "@/lib/slots";
import {
  APP_EMAIL_VERIFY_PATH,
  APP_PASSWORD_RESET_PATH,
  bookingTimezone,
  classNeedsSignature,
  pickBookingSession,
  placeFields,
  reauthMethod,
  socialLinkAllowed,
  teacherOffers,
} from "@/lib/student-api";

describe("student API contract helpers", () => {
  it("keeps password reset and email verification on the app deep links", () => {
    expect(APP_PASSWORD_RESET_PATH).toBe("/reset");
    expect(APP_EMAIL_VERIFY_PATH).toBe("/verify");
  });

  it("maps a place and leaves virtual classes without coordinates", () => {
    expect(placeFields(null)).toBeNull();
    expect(placeFields({ lat: 34.05, lng: -118.24, neighborhood: "Echo Park", name: "Studio", city: "Los Angeles" })).toEqual({
      lat: 34.05,
      lng: -118.24,
      neighborhood: "Echo Park",
      name: "Studio",
      city: "Los Angeles",
    });
  });

  it("asks for a signature only when the teacher published waiver text", () => {
    expect(classNeedsSignature(null)).toBe(false);
    expect(classNeedsSignature("   ")).toBe(false);
    expect(classNeedsSignature("I agree to the studio waiver.")).toBe(true);
    expect(needsWaiver({ required: classNeedsSignature(""), currentVersion: 1, signedVersion: null })).toBe(false);
    expect(needsWaiver({ required: classNeedsSignature("Sign here"), currentVersion: 2, signedVersion: 1 })).toBe(true);
  });

  it("exposes pack and membership ids and prices for the teacher profile", () => {
    expect(teacherOffers(
      [{ id: "pack-1", slug: "five", name: "Five classes", priceCents: 9000, creditCount: 5 }],
      [{ id: "mem-1", slug: "monthly", name: "Monthly", priceCents: 12000 }],
    )).toEqual({
      packs: [{ id: "pack-1", slug: "five", name: "Five classes", priceCents: 9000, creditCount: 5 }],
      memberships: [{ id: "mem-1", slug: "monthly", name: "Monthly", priceCents: 12000 }],
    });
  });

  it("picks the soonest upcoming session, then the earliest past one", () => {
    const early = { startsAt: new Date("2026-01-01T18:00:00Z"), endsAt: new Date("2026-01-01T19:00:00Z") };
    const next = { startsAt: new Date("2026-06-01T18:00:00Z"), endsAt: new Date("2026-06-01T19:00:00Z") };
    const later = { startsAt: new Date("2026-07-01T18:00:00Z"), endsAt: new Date("2026-07-01T19:00:00Z") };
    const now = new Date("2026-05-01T00:00:00Z");
    expect(pickBookingSession([later, early, next], now)).toBe(next);
    expect(pickBookingSession([later, early], new Date("2026-08-01T00:00:00Z"))).toBe(early);
    expect(pickBookingSession([], now)).toBeNull();
  });

  it("does not let a cancelled or skipped date become the booking time", () => {
    const now = new Date("2026-05-01T00:00:00Z");
    const past = { startsAt: new Date("2026-01-01T18:00:00Z"), endsAt: new Date("2026-01-01T19:00:00Z"), status: "scheduled", exception: null };
    const skipped = { startsAt: new Date("2026-06-01T18:00:00Z"), endsAt: new Date("2026-06-01T19:00:00Z"), status: "scheduled", exception: "skipped" };
    const cancelled = { startsAt: new Date("2026-06-15T18:00:00Z"), endsAt: new Date("2026-06-15T19:00:00Z"), status: "cancelled", exception: null };
    const paused = { startsAt: new Date("2026-07-01T18:00:00Z"), endsAt: new Date("2026-07-01T19:00:00Z"), status: "paused", exception: null };
    const scheduled = { startsAt: new Date("2026-08-01T18:00:00Z"), endsAt: new Date("2026-08-01T19:00:00Z"), status: "scheduled", exception: "moved" };
    expect(pickBookingSession([skipped, cancelled, scheduled, past], now)).toBe(scheduled);
    expect(pickBookingSession([cancelled, skipped, paused, past], now)).toBe(paused);
    expect(pickBookingSession([cancelled, skipped], now)).toBeNull();
    expect(pickBookingSession([cancelled, past], now)).toBe(past);
  });

  it("uses the class timezone and falls back to Los Angeles", () => {
    expect(bookingTimezone(["", "America/New_York"])).toBe("America/New_York");
    expect(bookingTimezone([])).toBe("America/Los_Angeles");
  });

  it("accepts a password or an Apple or Google token for account deletion", () => {
    expect(reauthMethod({ password: "secret" })).toBe("password");
    expect(reauthMethod({ provider: "apple", idToken: "tok", nonce: "n" })).toBe("social");
    expect(reauthMethod({ provider: "google", idToken: "tok" })).toBe("social");
    expect(reauthMethod({})).toBeNull();
    expect(reauthMethod({ provider: "apple" })).toBeNull();
    expect(reauthMethod({ provider: "github", idToken: "tok" })).toBeNull();
  });

  it("links a social sign-in only when both emails are verified and equal", () => {
    expect(socialLinkAllowed({ providerEmailVerified: true, localEmailVerified: true, sameEmail: true })).toBe(true);
    expect(socialLinkAllowed({ providerEmailVerified: true, localEmailVerified: false, sameEmail: true })).toBe(false);
    expect(socialLinkAllowed({ providerEmailVerified: false, localEmailVerified: true, sameEmail: true })).toBe(false);
    expect(socialLinkAllowed({ providerEmailVerified: true, localEmailVerified: true, sameEmail: false })).toBe(false);
  });
});
