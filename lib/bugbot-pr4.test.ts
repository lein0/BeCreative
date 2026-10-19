import { describe, expect, it } from "vitest";
import { cancelFailureRedirect, checkoutMustReleaseSeat, seriesCancelError, sessionBelongsToClass, sessionCancelAlreadyApplied } from "@/lib/checkout-rules";
import { creditOptInFromForm, deferredSmsStillPending, escapeHtml, listUnsubscribeUrl, nextDigestTime, notificationPhone, OUTBOX_INBOX_SENT, outboxStatusAfterDelivery, outboxStillNeedsInbox, phoneFromForm, reminderNoticeId, smsSendKeepsOutboxPending, unsubscribeConfirmedBy, unsubscribeUrl } from "@/lib/notify-prefs";
import { quoteWithStudioCredit } from "@/lib/pricing";
import { adminRefundScope, applyStudioCredit, entitlementRestoreKey, expiredHoldStudioCreditRestore, introRestoresWhenBookingCloses, nextAdminRefundKey, nextStripeRefundKey, parseStudioCreditLedgerSource, refundCashAlreadyReserved, refundedTotalAfterReserve, refundFailureKeepsSeat, refundLedgerMatchesSession, refundLedgerStatus, refundReplayIsSuccess, refundReserveFailed, seriesBookingCloses, sessionIdFromEntitlementRestore, sessionsStillNeedingRestore, studentCancelRefundCounts, studioCreditLedgerSource, studioCreditRestoreCents, studioCreditRestoreForPostedRefund, teacherCancelRetriesRefundOnly, teacherRefundStillOpen } from "@/lib/refund-math";
import { bookingStudentName, classBookingSendsDirectEmail, paidCheckoutEmitsBookingNotifications } from "@/lib/review-rules";
import { statementDescriptor, statementDescriptorSuffix } from "@/lib/connect-rules";
import { nextQuietEnd } from "@/lib/notify-prefs";
import { crashedJobShouldStop, jobIsClaimable, jobOutcomeAfterError, jobRetryDelayMs } from "@/lib/job-rules";
import { waitlistEventForAudience } from "@/lib/ship-defaults";
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

  it("keeps the form key after an error and mints a new one after success", () => {
    expect(nextAdminRefundKey({ stored: "key-1", succeeded: false, minted: "key-2" })).toBe("key-1");
    expect(nextAdminRefundKey({ stored: "key-1", succeeded: true, minted: "key-2" })).toBe("key-2");
    expect(nextAdminRefundKey({ stored: null, succeeded: false, minted: "key-2" })).toBe("key-2");
  });
});

describe("quiet hours follow Pacific time", () => {
  it("waits until 8am Pacific after daylight time ends", () => {
    const winter = nextQuietEnd("08:00", new Date("2026-11-03T14:00:00.000Z"));
    expect(winter.toISOString()).toBe("2026-11-03T16:00:00.000Z");
    const summer = nextQuietEnd("08:00", new Date("2026-07-15T13:00:00.000Z"));
    expect(summer.toISOString()).toBe("2026-07-15T15:00:00.000Z");
  });
});

describe("card statement suffix", () => {
  it("uses the studio name instead of the sliced prefix", () => {
    const descriptor = statementDescriptor("Yoga Fit", "BECREATIVE");
    expect(statementDescriptorSuffix(descriptor)).toBe("YOGAFIT");
    expect(statementDescriptorSuffix(descriptor)).not.toBe("ATIVEYOGAF");
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
    expect(paidCheckoutEmitsBookingNotifications("visit")).toBe(true);
  });
});

describe("series re-cancel", () => {
  it("does not restore entitlements for a date that is already cancelled", () => {
    expect(sessionCancelAlreadyApplied("cancelled")).toBe(true);
    expect(sessionCancelAlreadyApplied("scheduled")).toBe(false);
  });
});

describe("series cancel restores each date once", () => {
  it("skips sessions a teacher cancel already restored", () => {
    const key = entitlementRestoreKey("booking-1", "session-a");
    expect(sessionIdFromEntitlementRestore(key, "booking-1")).toBe("session-a");
    expect(sessionIdFromEntitlementRestore("restore:order-1:500:student", "booking-1")).toBeNull();
    expect(sessionsStillNeedingRestore({
      refundableSessionIds: ["session-a", "session-b", "session-c"],
      restoredSessionIds: ["session-a"],
    })).toEqual(["session-b", "session-c"]);
  });
});

describe("refund failures keep the seat", () => {
  it("drops the seat only after a card refund is refused for an empty balance", () => {
    expect(refundFailureKeepsSeat("Card refund was not sent to Stripe.")).toBe(true);
    expect(refundFailureKeepsSeat("Stripe refund failed.")).toBe(true);
    expect(refundFailureKeepsSeat("Nothing left to refund.")).toBe(false);
    expect(refundFailureKeepsSeat(undefined)).toBe(false);
  });
});

describe("refund counter", () => {
  it("adds to the current total instead of writing a stale snapshot", () => {
    expect(refundedTotalAfterReserve(4000, 3000, 10000)).toBe(7000);
    expect(refundedTotalAfterReserve(0, 3000, 10000)).toBe(3000);
    expect(refundedTotalAfterReserve(4000, 10000, 10000)).toBeNull();
  });

  it("does not post a card refund that never reached Stripe", () => {
    expect(refundLedgerStatus({ amountCents: 3000, hasPaymentIntent: true, stripeRefundId: null })).toBe("failed");
    expect(refundLedgerStatus({ amountCents: 3000, hasPaymentIntent: true, stripeRefundId: "re_1" })).toBe("posted");
    expect(refundLedgerStatus({ amountCents: 3000, hasPaymentIntent: false, stripeRefundId: null })).toBe("offline");
    expect(refundLedgerStatus({ amountCents: 0, hasPaymentIntent: true, stripeRefundId: null })).toBe("posted");
    expect(refundCashAlreadyReserved("reserved:refund:1")).toBe(true);
    expect(refundCashAlreadyReserved("pending:refund:1")).toBe(false);
    expect(nextStripeRefundKey({ ledgerKey: "refund:1", status: "pending", pendingMarker: "reserved:refund:1", retryNonce: "n" })).toBe("refund:1");
  });
});

describe("teacher cancel intro", () => {
  it("restores the intro offer when the booking closes and every date is still ahead", () => {
    expect(introRestoresWhenBookingCloses({ closesBooking: true, everySessionStillAhead: true })).toBe(true);
    expect(introRestoresWhenBookingCloses({ closesBooking: false, everySessionStillAhead: true })).toBe(false);
    expect(introRestoresWhenBookingCloses({ closesBooking: true, everySessionStillAhead: false })).toBe(false);
  });
});

describe("booking mail respects unsubscribe", () => {
  it("sends class confirmation through the outbox", () => {
    expect(classBookingSendsDirectEmail()).toBe(false);
  });
});

describe("cancel reason in email", () => {
  it("escapes HTML in the message body", () => {
    expect(escapeHtml(`<img src=x onerror=alert(1)>`)).toBe("&lt;img src=x onerror=alert(1)&gt;");
    expect(escapeHtml(`Tom & "Ann"`)).toBe("Tom &amp; &quot;Ann&quot;");
  });
});

describe("job retries", () => {
  it("reclaims a crashed running job and retries a failed one with a cap", () => {
    const now = new Date("2026-10-13T15:00:00.000Z");
    const stale = new Date("2026-10-13T14:00:00.000Z");
    expect(jobIsClaimable({ status: "running", runAt: stale, lockedAt: stale, now, attempts: 1 })).toBe(true);
    expect(jobIsClaimable({ status: "running", runAt: stale, lockedAt: now, now, attempts: 1 })).toBe(false);
    expect(jobIsClaimable({ status: "queued", runAt: now, lockedAt: null, now, attempts: 2 })).toBe(true);
    expect(jobIsClaimable({ status: "failed", runAt: stale, lockedAt: null, now, attempts: 1 })).toBe(false);
    expect(jobIsClaimable({ status: "running", runAt: stale, lockedAt: stale, now, attempts: 5 })).toBe(false);
    expect(crashedJobShouldStop(5)).toBe(true);
    expect(crashedJobShouldStop(4)).toBe(false);
    expect(jobOutcomeAfterError(1)).toBe("queued");
    expect(jobOutcomeAfterError(5)).toBe("failed");
    expect(jobRetryDelayMs(1)).toBe(30_000);
    expect(jobRetryDelayMs(3)).toBe(120_000);
  });
});

describe("one-click unsubscribe", () => {
  it("posts to the API route and keeps the human link on the page", () => {
    expect(listUnsubscribeUrl("https://classes.example", "tok")).toBe("https://classes.example/api/unsubscribe/tok");
    expect(unsubscribeUrl("https://classes.example", "tok")).toBe("https://classes.example/unsubscribe/tok");
  });
});

describe("sms phone", () => {
  it("uses the number stored on the user when the job has none", () => {
    expect(notificationPhone(null, " 213-555-0100 ")).toBe("213-555-0100");
    expect(notificationPhone(" 310-555-0199 ", "213-555-0100")).toBe("310-555-0199");
    expect(notificationPhone(null, "  ")).toBeNull();
    expect(phoneFromForm({ savePhone: false, phone: "213" })).toBeNull();
    expect(phoneFromForm({ savePhone: true, phone: " 213-555-0100 " })).toBe("213-555-0100");
  });
});

describe("daily digest", () => {
  it("sends later today when 15:00 UTC has not passed", () => {
    expect(nextDigestTime(new Date("2026-10-13T10:00:00.000Z")).toISOString()).toBe("2026-10-13T15:00:00.000Z");
    expect(nextDigestTime(new Date("2026-10-13T16:00:00.000Z")).toISOString()).toBe("2026-10-14T15:00:00.000Z");
    expect(nextDigestTime(new Date("2026-10-13T15:00:00.000Z")).toISOString()).toBe("2026-10-14T15:00:00.000Z");
  });
});

describe("failed teacher refunds can retry", () => {
  it("retries an open card refund and does not rerun a posted cancel", () => {
    expect(teacherCancelRetriesRefundOnly("cancelled")).toBe(true);
    expect(teacherCancelRetriesRefundOnly("scheduled")).toBe(false);
    expect(teacherRefundStillOpen("failed")).toBe(true);
    expect(teacherRefundStillOpen("pending")).toBe(true);
    expect(teacherRefundStillOpen("posted")).toBe(false);
    const key = "refund:order-1:session-9:2500:teacher_cancel";
    expect(refundLedgerMatchesSession(key, "session-9")).toBe(true);
    expect(refundLedgerMatchesSession(key, "order-1")).toBe(true);
    expect(refundLedgerMatchesSession(key, "session-8")).toBe(false);
  });
});

describe("student refund skips cancelled dates", () => {
  it("does not count a teacher-cancelled date in the refund share", () => {
    const now = new Date("2026-10-13T15:00:00.000Z");
    const counts = studentCancelRefundCounts([
      { startsAt: new Date("2026-10-01T15:00:00.000Z"), status: "scheduled" },
      { startsAt: new Date("2026-10-20T15:00:00.000Z"), status: "cancelled" },
      { startsAt: new Date("2026-10-27T15:00:00.000Z"), status: "scheduled" },
      { startsAt: new Date("2026-11-03T15:00:00.000Z"), status: "scheduled" },
    ], now);
    expect(counts.hasFuture).toBe(true);
    expect(counts.sessionCount).toBe(4);
    expect(counts.cancelledCount).toBe(2);
    expect(counts.refundAnchor?.toISOString()).toBe("2026-10-27T15:00:00.000Z");
    const onlyCancelled = studentCancelRefundCounts([
      { startsAt: new Date("2026-10-20T15:00:00.000Z"), status: "cancelled" },
    ], now);
    expect(onlyCancelled.hasFuture).toBe(true);
    expect(onlyCancelled.cancelledCount).toBe(0);
    expect(onlyCancelled.refundAnchor).toBeNull();
  });
});

describe("unsubscribe confirmation", () => {
  it("does not unsubscribe on GET", () => {
    expect(unsubscribeConfirmedBy("GET")).toBe(false);
    expect(unsubscribeConfirmedBy("get")).toBe(false);
    expect(unsubscribeConfirmedBy("POST")).toBe(true);
  });
});

describe("full refund restores studio credit", () => {
  it("returns the remainder only when the refund covers the order", () => {
    expect(studioCreditRestoreForPostedRefund({ full: true, orderId: "order-1" })).toEqual({
      scope: "refund-order-1",
      sessionCount: 1,
      cancelledCount: 1,
      closeRemainder: true,
    });
    expect(studioCreditRestoreForPostedRefund({ full: false, orderId: "order-1" })).toBeNull();
  });
});

describe("cancel action surfaces refund failures", () => {
  it("sends the student back to bookings with the refund error", () => {
    expect(cancelFailureRedirect("Card refund was not sent to Stripe.")).toBe("/bookings?error=Card%20refund%20was%20not%20sent%20to%20Stripe.");
    expect(cancelFailureRedirect(undefined)).toBeNull();
  });
});

describe("series cancel surfaces refund errors", () => {
  it("returns the first date whose refund failed", () => {
    expect(seriesCancelError([undefined, "Card refund was not sent to Stripe.", "Stripe refund failed."])).toBe("Card refund was not sent to Stripe.");
    expect(seriesCancelError([undefined, null])).toBeNull();
  });
});

describe("notification retry skips inbox", () => {
  it("sends in-app and email only while the outbox is pending", () => {
    expect(outboxStillNeedsInbox("pending")).toBe(true);
    expect(outboxStillNeedsInbox(OUTBOX_INBOX_SENT)).toBe(false);
    expect(outboxStillNeedsInbox("sent")).toBe(false);
    expect(outboxStillNeedsInbox("sms_pending")).toBe(false);
  });
});

describe("student waitlist event", () => {
  it("uses the student catalog event", () => {
    expect(waitlistEventForAudience("student")).toBe("waitlist.spot_open");
    expect(waitlistEventForAudience("teacher")).toBe("waitlist.joined");
  });
});

describe("expired holds restore studio credit", () => {
  it("returns the whole spend the same way an abandoned checkout does", () => {
    expect(expiredHoldStudioCreditRestore()).toEqual({
      scope: "expired",
      sessionCount: 1,
      cancelledCount: 1,
      closeRemainder: true,
    });
    const restore = expiredHoldStudioCreditRestore();
    expect(studioCreditRestoreCents({
      appliedCents: 4000,
      sessionCount: restore.sessionCount,
      cancelledCount: restore.cancelledCount,
      alreadyRestoredCents: 0,
      closeRemainder: restore.closeRemainder,
    })).toBe(4000);
  });
});

describe("webhook refunds restore studio credit", () => {
  it("uses the same full-refund restore as an in-app refund", () => {
    expect(studioCreditRestoreForPostedRefund({ full: true, orderId: "order-9" })).toEqual({
      scope: "refund-order-9",
      sessionCount: 1,
      cancelledCount: 1,
      closeRemainder: true,
    });
  });
});

describe("series cancel closes the booking", () => {
  it("stays confirmed while another date is still scheduled", () => {
    expect(seriesBookingCloses({ kind: "series", remainingStatuses: ["scheduled", "cancelled"], linkedRemaining: 2 })).toBe(false);
    expect(seriesBookingCloses({ kind: "series", remainingStatuses: ["cancelled", "cancelled"], linkedRemaining: 2 })).toBe(true);
    expect(seriesBookingCloses({ kind: "series", remainingStatuses: [], linkedRemaining: 0 })).toBe(true);
    expect(seriesBookingCloses({ kind: "series", remainingStatuses: ["cancelled"], linkedRemaining: 2 })).toBe(false);
    expect(seriesBookingCloses({ kind: "session", remainingStatuses: ["scheduled"], linkedRemaining: 1 })).toBe(true);
  });
});

describe("failed texts stay pending", () => {
  it("retries a Twilio error and accepts a skipped send", () => {
    expect(smsSendKeepsOutboxPending({ ok: false, skipped: false })).toBe(true);
    expect(smsSendKeepsOutboxPending({ ok: false, skipped: true })).toBe(false);
    expect(smsSendKeepsOutboxPending({ ok: true })).toBe(false);
  });
});

describe("visit booking names the student", () => {
  it("uses the account name and falls back to email", () => {
    expect(bookingStudentName("Ada Lovelace", "ada@example.com")).toBe("Ada Lovelace");
    expect(bookingStudentName("  ", "ada@example.com")).toBe("ada@example.com");
    expect(bookingStudentName(null, "ada@example.com")).toBe("ada@example.com");
  });
});

describe("reminder replay uses one notice", () => {
  it("keeps the same outbox id when the job runs again", () => {
    expect(reminderNoticeId("job-1")).toBe("reminder:job-1");
    expect(reminderNoticeId(" job-1 ")).toBe(reminderNoticeId("job-1"));
    expect(reminderNoticeId("job-2")).not.toBe("reminder:job-1");
    expect(reminderNoticeId(" ")).toBe("");
  });
});

describe("unmarked reserve does not freeze cash", () => {
  it("treats a pending marker as unreserved and a shortfall as cash that was not kept", () => {
    expect(refundCashAlreadyReserved("pending:refund:1")).toBe(false);
    expect(refundCashAlreadyReserved("reserved:refund:1")).toBe(true);
    expect(refundReserveFailed(0, 2500)).toBe(true);
    expect(refundReserveFailed(2500, 2500)).toBe(false);
  });
});
