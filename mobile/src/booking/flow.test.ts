import { describe, expect, it } from "vitest";
import { quotePrice } from "../../../lib/pricing";
import { fixturePromos } from "../api/fixtures";
import {
  calendarEvent,
  canReschedule,
  cancelDecision,
  googleCalendarLink,
  helpActions,
  needsPaymentSheet,
  priceBooking,
  rescheduleTargetSlot,
  selectionListPrice,
  waiverReady,
} from "./flow";

const now = new Date("2026-10-08T18:00:00.000Z");

function session(hoursAhead: number, overrides: Partial<{ capacity: number; confirmedCount: number; status: "scheduled" | "cancelled" | "completed" | "paused" }> = {}) {
  const startsAt = new Date(now.getTime() + hoursAhead * 3600_000);
  return {
    id: `s-${hoursAhead}`,
    startsAt,
    endsAt: new Date(startsAt.getTime() + 90 * 60_000),
    status: overrides.status ?? "scheduled" as const,
    capacity: overrides.capacity ?? 10,
    confirmedCount: overrides.confirmedCount ?? 1,
  };
}

describe("booking flow", () => {
  it("prices a single date and rejects a full one", () => {
    const open = selectionListPrice({
      kind: "session",
      now,
      sessionPriceCents: 3600,
      seriesPriceCents: 24000,
      session: session(48),
    });
    expect(open.ok && open.cents).toBe(3600);
    const full = selectionListPrice({
      kind: "session",
      now,
      sessionPriceCents: 3600,
      seriesPriceCents: null,
      session: session(48, { capacity: 2, confirmedCount: 2 }),
    });
    expect(full.ok).toBe(false);
  });

  it("prices a series from the series price, not the sum of dates", () => {
    const priced = selectionListPrice({
      kind: "series",
      now,
      sessionPriceCents: 3600,
      seriesPriceCents: 24000,
      seriesSessions: [session(48), session(96)],
    });
    expect(priced.ok && priced.cents).toBe(24000);
    expect(priced.ok && priced.sessionIds).toHaveLength(2);
  });

  it("adds appointment add-ons and multiplies sauna spots", () => {
    const slot = { id: "slot", startsAt: session(30).startsAt, endsAt: session(30).endsAt, remaining: 4, priceCents: 3500 };
    const appointment = selectionListPrice({
      kind: "appointment",
      now,
      sessionPriceCents: 12000,
      seriesPriceCents: null,
      slot: { ...slot, priceCents: 12000 },
      addons: [{ id: "stones", priceCents: 1500 }],
    });
    expect(appointment.ok && appointment.cents).toBe(13500);
    const sauna = selectionListPrice({
      kind: "capacity",
      now,
      sessionPriceCents: 3500,
      seriesPriceCents: null,
      slot,
      partySize: 2,
    });
    expect(sauna.ok && sauna.cents).toBe(7000);
    const packed = selectionListPrice({
      kind: "capacity",
      now,
      sessionPriceCents: 3500,
      seriesPriceCents: null,
      slot: { ...slot, remaining: 1 },
      partySize: 2,
    });
    expect(packed.ok).toBe(false);
  });

  it("lets a platform promo change the shared quote, and a free intro beats the code", () => {
    const promo = fixturePromos()[0];
    const discounted = priceBooking({
      listPriceCents: 3600,
      feePercent: 10,
      feeFixedCents: 0,
      promo,
      kind: "session",
      firstClassFreeEnabled: false,
      introAlreadyUsed: false,
    });
    expect(discounted).toEqual(quotePrice({ listPriceCents: 3600, feePercent: 10, feeFixedCents: 0, promo }));
    expect(discounted.studentPaysCents).toBe(3060);
    const intro = priceBooking({
      listPriceCents: 3600,
      feePercent: 10,
      feeFixedCents: 0,
      promo,
      kind: "session",
      firstClassFreeEnabled: true,
      introAlreadyUsed: false,
    });
    expect(intro.paymentPath).toBe("first_class_free");
    expect(intro.studentPaysCents).toBe(0);
    expect(needsPaymentSheet(intro)).toBe(false);
    expect(needsPaymentSheet(discounted)).toBe(true);
  });

  it("applies the cancel and reschedule windows", () => {
    expect(cancelDecision({ now, startsAt: session(30).startsAt, status: "confirmed", kind: "session" }).allowed && cancelDecision({ now, startsAt: session(30).startsAt, status: "confirmed", kind: "session" })).toMatchObject({ refund: "full" });
    const credit = cancelDecision({ now, startsAt: session(5).startsAt, status: "confirmed", kind: "session" });
    expect(credit.allowed && credit.refund).toBe("credit");
    const late = cancelDecision({ now, startsAt: session(1).startsAt, status: "confirmed", kind: "series" });
    expect(late.allowed && late.refund).toBe("none");
    expect(late.allowed && late.message).toMatch(/not prorated/);
    expect(canReschedule({ now, startsAt: session(20).startsAt, status: "confirmed", kind: "session" }).ok).toBe(true);
    expect(canReschedule({ now, startsAt: session(4).startsAt, status: "confirmed", kind: "session" }).ok).toBe(false);
    expect(canReschedule({ now, startsAt: session(48).startsAt, status: "confirmed", kind: "series" }).ok).toBe(false);
    const slot = { id: "slot", startsAt: session(30).startsAt, endsAt: session(30).endsAt, remaining: 0, priceCents: 1800 };
    expect(rescheduleTargetSlot({ now, slot, partySize: 1 }).ok).toBe(false);
  });

  it("requires a matching waiver signature and builds calendar and help actions", () => {
    expect(waiverReady({ required: true, agreed: true, signedName: "Sam Rivera", accountName: "sam rivera" }).ok).toBe(true);
    expect(waiverReady({ required: true, agreed: true, signedName: "Someone Else", accountName: "Sam Rivera" }).ok).toBe(false);
    const event = calendarEvent({
      title: "Scene Study",
      teacherName: "Maya Alvarez",
      startsAt: session(48).startsAt,
      endsAt: session(48).endsAt,
      location: "Silver Lake",
    });
    expect(googleCalendarLink(event)).toContain("text=Scene+Study");
    expect(googleCalendarLink(event)).toContain("Silver+Lake");
    const actions = helpActions({ now, startsAt: session(48).startsAt, status: "confirmed", kind: "session" });
    expect(actions.find((item) => item.id === "cancel")?.enabled).toBe(true);
    expect(actions.find((item) => item.id === "safety")?.enabled).toBe(true);
  });
});
