import { describe, expect, it } from "vitest";
import { lateCancelFee, resolvedPolicy, studentCancelOutcome, teacherRefundChoice } from "@/lib/cancel-policy";
import { channelsFor, defaultPrefs, smsAllowedNow, unsubscribeUrl, withinQuietHours } from "@/lib/notify-prefs";
import { packCreditsToRestore, partialRefundRemaining, promoReversesOnRefund, refundIdempotencyKey, seriesProrate } from "@/lib/refund-math";
import { SHIP_DEFAULTS, policySummary } from "@/lib/ship-defaults";
import { duplicateChargeBlocked, webhookShouldProcess } from "@/lib/webhook-idempotency";

const start = new Date("2026-10-20T18:00:00Z");

describe("cancellation policy windows", () => {
  it("refunds in full before 24 hours, credit until 2 hours, then nothing", () => {
    expect(studentCancelOutcome({ now: new Date("2026-10-19T17:00:00Z"), startsAt: start, fullRefundHours: 24, creditOnlyHours: 2 })).toBe("full_refund");
    expect(studentCancelOutcome({ now: new Date("2026-10-20T10:00:00Z"), startsAt: start, fullRefundHours: 24, creditOnlyHours: 2 })).toBe("credit");
    expect(studentCancelOutcome({ now: new Date("2026-10-20T17:00:00Z"), startsAt: start, fullRefundHours: 24, creditOnlyHours: 2 })).toBe("none");
  });

  it("keeps late and no-show fees off unless a setting turns them on", () => {
    expect(SHIP_DEFAULTS.lateCancelFeeCents).toBe(0);
    expect(SHIP_DEFAULTS.noShowFeeCents).toBe(0);
    expect(lateCancelFee({ outcome: "none", lateCancelFeeCents: 0 })).toBe(0);
    expect(lateCancelFee({ outcome: "none", lateCancelFeeCents: 1500 })).toBe(1500);
    expect(lateCancelFee({ outcome: "full_refund", lateCancelFeeCents: 1500 })).toBe(0);
  });

  it("lets a teacher substitute credit only when the student opted in", () => {
    expect(teacherRefundChoice({ studentOptedIntoCredit: false, teacherWantsCredit: true, creditRequiresStudentOptIn: true })).toBe("full_refund");
    expect(teacherRefundChoice({ studentOptedIntoCredit: true, teacherWantsCredit: true, creditRequiresStudentOptIn: true })).toBe("credit");
    expect(teacherRefundChoice({ studentOptedIntoCredit: true, teacherWantsCredit: false, creditRequiresStudentOptIn: true })).toBe("full_refund");
  });

  it("uses the teacher override when one is set", () => {
    const policy = resolvedPolicy(
      { fullRefundHours: 24, creditOnlyHours: 2, lateCancelFeeCents: 0, noShowFeeCents: 0 },
      { fullRefundHours: 48, creditOnlyHours: null, lateCancelFeeCents: null, noShowFeeCents: 0 },
    );
    expect(policy.fullRefundHours).toBe(48);
    expect(policy.creditOnlyHours).toBe(2);
  });
});

describe("refund math", () => {
  it("prorates one date of a series and the platform fee", () => {
    const result = seriesProrate({
      studentPaysCents: 24000,
      platformFeeCents: 2400,
      teacherAmountCents: 21600,
      sessionCount: 8,
      cancelledCount: 1,
      alreadyRefundedCents: 0,
    });
    expect(result.refundCents).toBe(3000);
    expect(result.feeReversedCents).toBe(300);
    expect(result.transferReversedCents).toBe(2700);
    expect(result.full).toBe(false);
  });

  it("reverses a promo only when the refund covers the whole charge", () => {
    expect(promoReversesOnRefund({ refundCents: 3000, studentPaysCents: 24000, alreadyRefundedCents: 0 })).toBe(false);
    expect(promoReversesOnRefund({ refundCents: 3000, studentPaysCents: 24000, alreadyRefundedCents: 21000 })).toBe(true);
  });

  it("restores one pack credit per cancelled date and caps a partial admin refund", () => {
    expect(packCreditsToRestore({ creditsConsumed: 8, cancelledSessions: 1, sessionCount: 8 })).toBe(1);
    expect(partialRefundRemaining(10000, 4000, 9000)).toBe(6000);
    expect(refundIdempotencyKey("ord_1", 3000, "teacher_cancel")).toBe("refund:ord_1:3000:teacher_cancel");
    expect(refundIdempotencyKey("ord_1", 3000, "teacher_cancel", "sess_a")).toBe("refund:ord_1:sess_a:3000:teacher_cancel");
    expect(refundIdempotencyKey("ord_1", 3000, "teacher_cancel", "sess_b")).not.toBe(refundIdempotencyKey("ord_1", 3000, "teacher_cancel", "sess_a"));
  });
});

describe("notification preferences", () => {
  it("defaults teachers and students to email and in-app, with SMS and push off", () => {
    expect(defaultPrefs("booking.created", "teacher")).toMatchObject({ email: true, inApp: true, sms: false, push: false, cadence: "instant" });
    const channels = channelsFor(defaultPrefs("booking.confirmed", "student"), { unsubscribed: false, webPushEnabled: false, smsConfigured: false });
    expect(channels).toMatchObject({ email: true, inApp: true, sms: false, push: false, digest: false });
    expect(channelsFor({ ...defaultPrefs("booking.confirmed", "student"), email: true }, { unsubscribed: true, webPushEnabled: true, smsConfigured: true }).email).toBe(false);
  });

  it("holds SMS during quiet hours that wrap midnight", () => {
    expect(withinQuietHours(22 * 60, "21:00", "08:00")).toBe(true);
    expect(withinQuietHours(7 * 60, "21:00", "08:00")).toBe(true);
    expect(withinQuietHours(12 * 60, "21:00", "08:00")).toBe(false);
    expect(smsAllowedNow(12 * 60)).toBe(true);
    expect(smsAllowedNow(22 * 60)).toBe(false);
  });

  it("builds an unsubscribe link", () => {
    expect(unsubscribeUrl("https://classes.example/", "tok")).toBe("https://classes.example/unsubscribe?token=tok");
  });
});

describe("webhook idempotency", () => {
  it("processes an event once", () => {
    expect(webhookShouldProcess({ eventId: "evt_1", alreadyStored: false })).toBe(true);
    expect(webhookShouldProcess({ eventId: "evt_1", alreadyStored: true })).toBe(false);
    expect(webhookShouldProcess({ eventId: "", alreadyStored: false })).toBe(false);
  });

  it("blocks a second charge for the same seat", () => {
    expect(duplicateChargeBlocked({ existingPaid: true, existingPending: false })).toBe(true);
    expect(duplicateChargeBlocked({ existingPaid: false, existingPending: true })).toBe(true);
    expect(duplicateChargeBlocked({ existingPaid: false, existingPending: false })).toBe(false);
  });
});

describe("default policy copy", () => {
  it("states the 24h and 2h windows and leaves fees out", () => {
    const summary = policySummary({
      fullRefundHours: SHIP_DEFAULTS.studentFullRefundHours,
      creditOnlyHours: SHIP_DEFAULTS.studentCreditOnlyHours,
      lateCancelFeeCents: SHIP_DEFAULTS.lateCancelFeeCents,
      noShowFeeCents: SHIP_DEFAULTS.noShowFeeCents,
    });
    expect(summary).toContain("24 hours");
    expect(summary).toContain("2 hours");
    expect(summary.includes("fee of")).toBe(false);
  });
});
