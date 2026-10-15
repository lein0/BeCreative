import { describe, expect, it } from "vitest";
import { acceptLatest, authNeedsVerification, authSessionRedirect, bookDisplayCents, bookingContinuePlan, bookingPayWith, bookingSubmitLock, checkoutCancelMessage, checkoutFollowsBooking, fieldAutoCapitalize, membershipsForClass, nativeIntentPath, orderToAbandon, packsForClass, PAYMENT_SHEET_RETURN_URL, paymentSheetForPlatform, postLoginPath, resumeBookingPath, resumePurchasePath, systemPathForIncomingUrl, unpaidCheckoutOrder, waiverLoadNotice, waiverSignGate, withoutStaleWaiverError } from "@/lib/mobile-client";

describe("live mobile checkout", () => {
  it("uses a Checkout Session on web and a PaymentSheet on native", () => {
    expect(paymentSheetForPlatform("web", true)).toBe(false);
    expect(paymentSheetForPlatform(undefined, true)).toBe(false);
    expect(paymentSheetForPlatform("ios", true)).toBe(true);
    expect(paymentSheetForPlatform("android", false)).toBe(false);
  });

  it("returns web checkout to the public page instead of cookie-gated bookings", () => {
    expect(authSessionRedirect("web", "https://classes.becreative.app/", "becreative://bookings")).toBe("https://classes.becreative.app/mobile/return");
    expect(authSessionRedirect("ios", "https://classes.becreative.app", "becreative://bookings")).toBe("becreative://bookings");
  });

  it("shows the series price and only packs that cover the class", () => {
    expect(bookDisplayCents({ series: true, sessionPriceCents: 3600, seriesPriceCents: 24000 })).toBe(24000);
    expect(bookDisplayCents({ series: false, sessionPriceCents: 3600, seriesPriceCents: 24000 })).toBe(3600);
    const packs = [
      { id: "scene", remaining: 4, classIds: ["class-scene"], categoryIds: [] as string[], teacherId: "maya" },
      { id: "yoga", remaining: 2, classIds: ["class-flow"], categoryIds: [] as string[], teacherId: "lena" },
      { id: "spent", remaining: 0, classIds: ["class-scene"], categoryIds: [] as string[], teacherId: "maya" },
    ];
    expect(packsForClass(packs, "class-scene", "acting", "maya").map((pack) => pack.id)).toEqual(["scene"]);
    const now = new Date("2026-10-15T12:00:00.000Z");
    const dated = [
      { id: "live", remaining: 2, expiresAt: "2026-12-01T00:00:00.000Z", classIds: ["class-scene"], categoryIds: [] as string[], teacherId: "maya" },
      { id: "expired", remaining: 2, expiresAt: "2026-10-01T00:00:00.000Z", classIds: ["class-scene"], categoryIds: [] as string[], teacherId: "maya" },
    ];
    expect(packsForClass(dated, "class-scene", "acting", "maya", now).map((pack) => pack.id)).toEqual(["live"]);
  });

  it("does not capitalize password fields", () => {
    expect(fieldAutoCapitalize("default", true)).toBe("none");
    expect(fieldAutoCapitalize("default", false)).toBe("sentences");
  });

  it("ignores an older explore response", () => {
    expect(acceptLatest(1, 2)).toBe(false);
    expect(acceptLatest(2, 2)).toBe(true);
  });

  it("returns to the class after sign-in and ignores off-site next paths", () => {
    expect(resumeBookingPath({ slug: "scene study", sessionId: "slot-1", series: false, code: "MAYA10" })).toBe("/book/scene%20study?session=slot-1&code=MAYA10");
    expect(postLoginPath("/book/scene%20study?session=slot-1")).toBe("/book/scene%20study?session=slot-1");
    expect(postLoginPath("https://evil.example/book")).toBe("/explore");
    expect(postLoginPath("//evil.example")).toBe("/explore");
    expect(resumePurchasePath({ teacherSlug: "maya chen", packSlug: "scene-10" })).toBe("/t/maya%20chen/p/scene-10");
    expect(resumePurchasePath({ teacherSlug: "maya", membershipSlug: "bewell" })).toBe("/t/maya/m/bewell");
    expect(postLoginPath(resumePurchasePath({ teacherSlug: "maya" }))).toBe("/t/maya");
  });

  it("keeps the waiver name field and the signature step on the same loaded waiver", () => {
    const pending = waiverSignGate({ classRequiresSignature: true, waiver: null, loadFailed: false, signedName: "Maya Chen" });
    expect(pending.readyToSign).toBe(false);
    expect(pending.showNameField).toBe(false);
    expect(pending.blockReason).toMatch(/loading/i);
    const failed = waiverSignGate({ classRequiresSignature: true, waiver: null, loadFailed: true, signedName: "Maya Chen" });
    expect(failed.readyToSign).toBe(false);
    expect(failed.blockReason).toMatch(/didn't load/i);
    const needsName = waiverSignGate({ classRequiresSignature: true, waiver: { required: true, signed: false }, loadFailed: false, signedName: "  " });
    expect(needsName.showNameField).toBe(true);
    expect(needsName.readyToSign).toBe(false);
    const ready = waiverSignGate({ classRequiresSignature: true, waiver: { required: true, signed: false }, loadFailed: false, signedName: "Maya Chen" });
    expect(ready.showNameField).toBe(true);
    expect(ready.readyToSign).toBe(true);
    const already = waiverSignGate({ classRequiresSignature: true, waiver: { required: true, signed: true }, loadFailed: false, signedName: "Maya Chen" });
    expect(already.showNameField).toBe(false);
    expect(already.readyToSign).toBe(false);
    expect(withoutStaleWaiverError(pending.blockReason)).toBeNull();
    expect(withoutStaleWaiverError("Accept the cancellation policy.")).toBe("Accept the cancellation policy.");
    const unsignedClass = waiverSignGate({ classRequiresSignature: false, waiver: null, loadFailed: true, signedName: "Maya Chen" });
    expect(unsignedClass.blockReason).toBeNull();
    expect(unsignedClass.readyToSign).toBe(false);
    expect(waiverLoadNotice(false, true)).toBeNull();
    expect(waiverLoadNotice(true, true)).toMatch(/didn't load/i);
  });

  it("keeps PaymentSheet returns off the bookings route", () => {
    expect(PAYMENT_SHEET_RETURN_URL.includes("bookings")).toBe(false);
    expect(PAYMENT_SHEET_RETURN_URL.startsWith("becreative://")).toBe(true);
    expect(systemPathForIncomingUrl(PAYMENT_SHEET_RETURN_URL)).toBeNull();
    expect(systemPathForIncomingUrl("/explore")).toBe("/explore");
  });

  it("does not treat a verification response as a signed-in session", () => {
    expect(authNeedsVerification({ verificationRequired: true })).toBe(true);
    expect(authNeedsVerification({ token: "" })).toBe(true);
    expect(authNeedsVerification({ token: "bc_tok" })).toBe(false);
  });

  it("does not open checkout for a series the student already has", () => {
    expect(checkoutFollowsBooking({ alreadyBooked: true })).toBe("bookings");
    expect(checkoutFollowsBooking({})).toBe("checkout");
  });

  it("pays a covered class with the membership instead of cash", () => {
    const plans = [
      { id: "sub-active", name: "Monthly studio", status: "active", periodEnd: "2026-12-01T00:00:00.000Z", classIds: ["class-scene"], categoryIds: [] as string[], teacherId: "maya" },
      { id: "sub-other", name: "Yoga", status: "active", periodEnd: "2026-12-01T00:00:00.000Z", classIds: ["class-flow"], categoryIds: [] as string[], teacherId: "lena" },
      { id: "sub-ended", name: "Old", status: "canceled", periodEnd: "2026-01-01T00:00:00.000Z", classIds: ["class-scene"], categoryIds: [] as string[], teacherId: "maya" },
    ];
    const now = new Date("2026-10-13T12:00:00.000Z");
    expect(membershipsForClass(plans, "class-scene", "acting", "maya", now).map((plan) => plan.id)).toEqual(["sub-active"]);
    expect(bookingPayWith({ membershipId: "sub-active", packId: "pack-1" })).toBe("membership:sub-active");
    expect(bookingPayWith({ packId: "pack-1" })).toBe("pack:pack-1");
    expect(bookingPayWith({})).toBe("cash");
  });

  it("explains a cancelled checkout when bookings opens with cancelled=1", () => {
    expect(checkoutCancelMessage("1")).toMatch(/cancelled/i);
    expect(checkoutCancelMessage(undefined)).toBeNull();
    expect(checkoutCancelMessage("0")).toBeNull();
  });

  it("lets only one continue tap create a booking", () => {
    const lock = bookingSubmitLock();
    expect(lock.tryAcquire()).toBe(true);
    expect(lock.tryAcquire()).toBe(false);
    lock.release();
    expect(lock.tryAcquire()).toBe(true);
  });

  it("releases Continue after checkout opens so Back can reopen Stripe", () => {
    const lock = bookingSubmitLock();
    const started = bookingContinuePlan(false, lock);
    expect(started.action).toBe("book");
    expect(bookingContinuePlan(false, lock).action).toBe("wait");
    if (started.action !== "book") throw new Error("expected a booking");
    const settled = started.finish(true);
    expect(settled).toEqual({ busy: false, reopenCheckout: true });
    expect(bookingContinuePlan(settled.reopenCheckout, lock).action).toBe("reopen");
    expect(lock.tryAcquire()).toBe(true);
  });

  it("falls back when a native intent path throws", () => {
    const explode = () => {
      throw new Error("bad path");
    };
    expect(nativeIntentPath("/bookings", true, explode)).toBe("/explore");
    expect(nativeIntentPath("/bookings", false, explode)).toBe("/bookings");
    expect(nativeIntentPath("becreative://stripe-return", true)).toBeNull();
  });

  it("releases the previous unpaid checkout when the date changes", () => {
    expect(unpaidCheckoutOrder({ orderId: "ord-1", clientSecret: "pi_secret" })).toBe("ord-1");
    expect(unpaidCheckoutOrder({ orderId: "ord-free" })).toBeNull();
    expect(orderToAbandon({ reopenCheckout: true, orderId: "ord-1" })).toBeNull();
    expect(orderToAbandon({ reopenCheckout: false, orderId: "ord-1" })).toBe("ord-1");
  });
});
