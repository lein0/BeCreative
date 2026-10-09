import { describe, expect, it } from "vitest";
import { checkoutMustReleaseSeat, sessionBelongsToClass, sessionCancelAlreadyApplied } from "@/lib/checkout-rules";
import { creditOptInFromForm, deferredSmsStillPending, outboxStatusAfterDelivery, unsubscribeUrl } from "@/lib/notify-prefs";
import { quoteWithStudioCredit } from "@/lib/pricing";
import { adminRefundScope, applyStudioCredit, nextStripeRefundKey, parseStudioCreditLedgerSource, refundReplayIsSuccess, studioCreditLedgerSource, studioCreditRestoreCents } from "@/lib/refund-math";
import { paidCheckoutEmitsBookingNotifications } from "@/lib/review-rules";
import { chargeRefundReleasesSeats, webhookClaimShouldRelease } from "@/lib/webhook-idempotency";

describe("partial refunds keep remaining seats", () => {
  it("releases seats only when the charge is fully refunded", () => {
    expect(chargeRefundReleasesSeats(false)).toBe(false);
    expect(chargeRefundReleasesSeats(true)).toBe(true);
  });
});

describe("unsubscribe route", () => {
  it("puts the token in the path the page reads", () => {
    expect(unsubscribeUrl("https://classes.example/", "tok en")).toBe("https://classes.example/unsubscribe/tok%20en");
    expect(unsubscribeUrl("https://classes.example", "tok")).not.toContain("?token=");
  });
});

describe("quiet-hour SMS", () => {
  it("leaves the outbox pending so the later job can send", () => {
    expect(outboxStatusAfterDelivery(true)).toBe("sms_pending");
    expect(outboxStatusAfterDelivery(false)).toBe("sent");
    expect(deferredSmsStillPending("sms_pending")).toBe(true);
    expect(deferredSmsStillPending("sent")).toBe(false);
  });
});

describe("visit checkout failure", () => {
  it("requires the pending seat to be released when charges are not enabled", () => {
    expect(checkoutMustReleaseSeat({ paymentsReady: false, orderPending: true })).toBe(true);
    expect(checkoutMustReleaseSeat({ paymentsReady: true, orderPending: true })).toBe(false);
    expect(checkoutMustReleaseSeat({ paymentsReady: false, orderPending: false })).toBe(false);
  });
});

describe("studio credit spend", () => {
  it("applies the balance up to the class price and fees the cash remainder", () => {
    expect(applyStudioCredit({ balanceCents: 4000, priceCents: 10000 })).toEqual({ appliedCents: 4000, remainderCents: 6000 });
    expect(applyStudioCredit({ balanceCents: 15000, priceCents: 10000 })).toEqual({ appliedCents: 10000, remainderCents: 0 });
    expect(applyStudioCredit({ balanceCents: 0, priceCents: 10000 }).appliedCents).toBe(0);
    const partial = quoteWithStudioCredit({ listPriceCents: 10000, appliedCents: 4000, feePercent: 10, feeFixedCents: 0 });
    expect(partial.studentPaysCents).toBe(6000);
    expect(partial.platformFeeCents).toBe(600);
    expect(partial.teacherAmountCents).toBe(5400);
    expect(partial.discountCents).toBe(4000);
    const covered = quoteWithStudioCredit({ listPriceCents: 10000, appliedCents: 10000, feePercent: 10, feeFixedCents: 0 });
    expect(covered.studentPaysCents).toBe(0);
    expect(covered.platformFeeCents).toBe(0);
    expect(covered.paymentPath).toBe("free");
    expect(parseStudioCreditLedgerSource(studioCreditLedgerSource("order-1", 4000))).toEqual({ orderId: "order-1", appliedCents: 4000 });
    expect(studioCreditRestoreCents({ appliedCents: 8000, sessionCount: 4, cancelledCount: 1, alreadyRestoredCents: 0, closeRemainder: false })).toBe(2000);
    expect(studioCreditRestoreCents({ appliedCents: 8000, sessionCount: 4, cancelledCount: 1, alreadyRestoredCents: 6000, closeRemainder: true })).toBe(2000);
    expect(studioCreditRestoreCents({ appliedCents: 8000, sessionCount: 1, cancelledCount: 1, alreadyRestoredCents: 8000, closeRemainder: true })).toBe(0);
  });
});

describe("credit opt-in", () => {
  it("saves only from the credit form", () => {
    expect(creditOptInFromForm({ saveCredit: false, checked: true })).toBeNull();
    expect(creditOptInFromForm({ saveCredit: true, checked: true })).toBe(true);
    expect(creditOptInFromForm({ saveCredit: true, checked: false })).toBe(false);
  });
});

describe("admin refund idempotency", () => {
  it("reuses the submitted key instead of minting a new one", () => {
    expect(adminRefundScope("same-submit")).toBe("admin:same-submit");
    expect(adminRefundScope("same-submit")).toBe(adminRefundScope("same-submit"));
    expect(adminRefundScope("  ")).toBe("admin");
    expect(adminRefundScope(null)).toBe("admin");
  });
});

describe("webhook retries", () => {
  it("releases a claimed event after the handler throws", () => {
    expect(webhookClaimShouldRelease({ claimed: true, failed: true })).toBe(true);
    expect(webhookClaimShouldRelease({ claimed: true, failed: false })).toBe(false);
    expect(webhookClaimShouldRelease({ claimed: false, failed: true })).toBe(false);
  });
});

describe("failed Stripe refund", () => {
  it("does not treat a pending or failed ledger row as a completed refund", () => {
    expect(refundReplayIsSuccess("posted")).toBe(true);
    expect(refundReplayIsSuccess("offline")).toBe(true);
    expect(refundReplayIsSuccess("pending")).toBe(false);
    expect(refundReplayIsSuccess("failed")).toBe(false);
  });

  it("reuses the in-flight Stripe key and mints a new one after a recorded failure", () => {
    expect(nextStripeRefundKey({ ledgerKey: "refund:1", status: "pending", pendingMarker: "pending:refund:1", retryNonce: "n" })).toBe("refund:1");
    expect(nextStripeRefundKey({ ledgerKey: "refund:1", status: "failed", pendingMarker: "pending:refund:1", retryNonce: "n2" })).toBe("refund:1:r:n2");
  });
});

describe("teacher cancel ownership", () => {
  it("rejects a session that belongs to another class", () => {
    expect(sessionBelongsToClass("class-a", "class-a")).toBe(true);
    expect(sessionBelongsToClass("class-b", "class-a")).toBe(false);
    expect(sessionBelongsToClass(null, "class-a")).toBe(false);
  });
});

describe("card checkout notifications", () => {
  it("emits booking events when a class order is paid", () => {
    expect(paidCheckoutEmitsBookingNotifications("booking")).toBe(true);
    expect(paidCheckoutEmitsBookingNotifications("pack")).toBe(false);
    expect(paidCheckoutEmitsBookingNotifications("visit")).toBe(false);
  });
});

describe("series re-cancel", () => {
  it("does not restore entitlements for a date that is already cancelled", () => {
    expect(sessionCancelAlreadyApplied("cancelled")).toBe(true);
    expect(sessionCancelAlreadyApplied("scheduled")).toBe(false);
  });
});
