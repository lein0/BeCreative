import { describe, expect, it } from "vitest";
import {
  bookingResultPath,
  collectsOnline,
  duplicateSeriesBooking,
  membershipStatusOnAbandon,
  membershipStatusOnCreate,
  membershipStatusOnPayment,
  orderMoney,
  packCreditsOnCreate,
  packCreditsOnPayment,
  parseAttributionCookie,
  chargeFullyRefunded,
  refundCancelsBooking,
  safeNextPath,
  sessionLockOrder,
  studioOwnsResource,
  unattendedRefundCents,
} from "@/lib/checkout-rules";
import { canSpendMembership, quotePrice, validatePromo, type PromoRule } from "@/lib/pricing";

const promo = (overrides: Partial<PromoRule> = {}): PromoRule => ({
  code: "PACK5",
  active: true,
  discountType: "percent",
  percentOffBps: 1000,
  amountOffCents: 0,
  startsAt: null,
  endsAt: null,
  maxRedemptions: 1,
  maxPerCustomer: 1,
  firstTimeOnly: false,
  minPurchaseCents: 0,
  funding: "teacher",
  platformSharePercent: 0,
  appliesTo: "packs",
  teacherId: "t1",
  classIds: [],
  categoryIds: [],
  packIds: ["pack-1"],
  membershipIds: [],
  cities: [],
  ...overrides,
});

describe("paid packs receive credits when checkout completes", () => {
  it("withholds credits while the card payment is pending and grants the full pack when it is paid", () => {
    expect(packCreditsOnCreate({ awaitingCardPayment: true, creditCount: 5 })).toBe(0);
    expect(packCreditsOnCreate({ awaitingCardPayment: false, creditCount: 5 })).toBe(5);
    expect(packCreditsOnPayment(5)).toBe(5);
  });
});

describe("unpaid memberships stay pending", () => {
  it("activates only after payment and cancels an abandoned hold", () => {
    expect(membershipStatusOnCreate(true)).toBe("pending");
    expect(membershipStatusOnCreate(false)).toBe("active");
    expect(membershipStatusOnPayment()).toBe("active");
    expect(membershipStatusOnAbandon()).toBe("cancelled");
    expect(canSpendMembership({
      status: "pending",
      periodEnd: new Date("2026-12-01"),
      now: new Date("2026-10-08"),
      unlimited: true,
      classesPerPeriod: null,
      classesUsed: 0,
      covers: true,
    }).ok).toBe(false);
  });
});

describe("login next path", () => {
  it("allows a same-origin path and rejects protocol-relative urls and backslashes", () => {
    expect(safeNextPath("/explore")).toBe("/explore");
    expect(safeNextPath("/bookings?paid=1")).toBe("/bookings?paid=1");
    expect(safeNextPath("//evil.example")).toBe("/explore");
    expect(safeNextPath("/\\evil.example")).toBe("/explore");
    expect(safeNextPath("https://evil.example")).toBe("/explore");
    expect(safeNextPath("")).toBe("/explore");
  });
});

describe("UTM cookie names", () => {
  it("reads the snake_case names written by the proxy", () => {
    const parsed = parseAttributionCookie(JSON.stringify({ ref: "bio", utm_source: "ig", utm_medium: "social", utm_campaign: "fall" }));
    expect(parsed).toEqual({ ref: "bio", utmSource: "ig", utmMedium: "social", utmCampaign: "fall" });
  });
});

describe("pack promo redemption limits", () => {
  it("rejects a pack code once the recorded redemption count reaches the cap", () => {
    const verdict = validatePromo({
      promo: promo(),
      now: new Date("2026-10-08"),
      listPriceCents: 5000,
      totalRedemptions: 1,
      customerRedemptions: 0,
      isFirstTimeStudent: true,
      product: { kind: "pack", teacherId: "t1", packId: "pack-1" },
    });
    expect(verdict).toEqual({ ok: false, reason: "This code has reached its redemption limit." });
  });
});

describe("membership checkout promos", () => {
  it("prices a membership with the same promo rules as a pack", () => {
    const verdict = validatePromo({
      promo: promo({ appliesTo: "memberships", membershipIds: ["mem-1"], packIds: [], code: "MEMBER10" }),
      now: new Date("2026-10-08"),
      listPriceCents: 8000,
      totalRedemptions: 0,
      customerRedemptions: 0,
      isFirstTimeStudent: true,
      product: { kind: "membership", teacherId: "t1", membershipId: "mem-1" },
    });
    expect(verdict.ok).toBe(true);
    const quote = quotePrice({
      listPriceCents: 8000,
      feePercent: 10,
      feeFixedCents: 0,
      promo: promo({ appliesTo: "memberships", membershipIds: ["mem-1"], packIds: [], code: "MEMBER10", funding: "teacher" }),
    });
    expect(quote.discountCents).toBe(800);
    expect(quote.studentPaysCents).toBe(7200);
  });
});

describe("waitlist is not a reservation", () => {
  it("sends a waitlisted booking to a waitlisted path", () => {
    expect(bookingResultPath({ waitlisted: true })).toBe("/bookings?waitlisted=1");
    expect(bookingResultPath({ alreadyBooked: true, checkoutUrl: "https://checkout.stripe.com/pay" })).toBe("/bookings?reserved=1");
    expect(bookingResultPath({})).toBe("/bookings?reserved=1");
  });
});

describe("series booking idempotency", () => {
  it("treats an existing confirmed series booking as a duplicate", () => {
    expect(duplicateSeriesBooking([{ classId: "class-1", kind: "series", status: "confirmed" }], "class-1")).toBe(true);
    expect(duplicateSeriesBooking([{ classId: "class-1", kind: "session", status: "confirmed" }], "class-1")).toBe(false);
    expect(duplicateSeriesBooking([{ classId: "class-1", kind: "series", status: "cancelled" }], "class-1")).toBe(false);
  });
});

describe("series checkout locks", () => {
  it("locks session rows in one sorted order", () => {
    expect(sessionLockOrder(["b", "a", "c"])).toEqual(["a", "b", "c"]);
    expect(sessionLockOrder(["b", "a", "c"])).toEqual(sessionLockOrder(["c", "b", "a"]));
  });
});

describe("offline orders charge no platform fee", () => {
  it("gives the teacher the amount the student pays at the studio", () => {
    const quote = quotePrice({ listPriceCents: 10_000, feePercent: 10, feeFixedCents: 0 });
    expect(collectsOnline(quote.studentPaysCents, false)).toBe(false);
    expect(orderMoney(quote, false)).toEqual({ platformFeeCents: 0, teacherAmountCents: 10_000, platformLiabilityCents: 0 });
    expect(orderMoney(quote, true).platformFeeCents).toBe(1000);
  });
});

describe("stripe refunds free the seat", () => {
  it("cancels a confirmed booking and leaves an already cancelled one alone", () => {
    expect(refundCancelsBooking("confirmed")).toBe(true);
    expect(refundCancelsBooking("cancelled")).toBe(false);
  });

  it("treats only a fully refunded charge as an order reversal", () => {
    expect(chargeFullyRefunded({ amount: 6000, amount_refunded: 2000, refunded: false })).toBe(false);
    expect(chargeFullyRefunded({ amount: 6000, amount_refunded: 6000, refunded: false })).toBe(true);
    expect(chargeFullyRefunded({ amount: 6000, amount_refunded: 6000, refunded: true })).toBe(true);
    expect(chargeFullyRefunded({ amount: 0, amount_refunded: 0, refunded: false })).toBe(false);
  });

  it("keeps the attended share of a series payment", () => {
    const now = new Date("2026-10-20T18:00:00Z");
    const sessions = [
      { startsAt: new Date("2026-10-06T18:00:00Z") },
      { startsAt: new Date("2026-10-13T18:00:00Z") },
      { startsAt: new Date("2026-10-27T18:00:00Z") },
      { startsAt: new Date("2026-11-03T18:00:00Z") },
    ];
    expect(unattendedRefundCents({ paidCents: 8000, sessions, now })).toBe(4000);
    expect(unattendedRefundCents({ paidCents: 8000, sessions: sessions.slice(2), now })).toBe(8000);
    expect(unattendedRefundCents({ paidCents: 8000, sessions: sessions.slice(0, 2), now })).toBe(0);
  });
});

describe("studio authorization", () => {
  it("rejects a session or recurrence that belongs to another teacher", () => {
    expect(studioOwnsResource("teacher-a", "teacher-a")).toBe(true);
    expect(studioOwnsResource("teacher-b", "teacher-a")).toBe(false);
    expect(studioOwnsResource(null, "teacher-a")).toBe(false);
  });
});
