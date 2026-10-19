import { describe, expect, it } from "vitest";
import { acceptLatest, authNeedsVerification, authSessionRedirect, bookDisplayCents, bookingContinuePlan, bookingPayWith, bookingSubmitLock, checkoutCancelMessage, checkoutFollowsBooking, checkoutIsSettled, fieldAutoCapitalize, keepCheckoutOpen, markCheckoutSettled, membershipsForClass, mobileReturnTarget, nativeIntentPath, orderToAbandon, packsForClass, PAYMENT_SHEET_RETURN_URL, paymentSheetForPlatform, postLoginPath, resumeBookingPath, SETTLED_CHECKOUT_ERROR, settledCheckoutBlocksRebook, systemPathForIncomingUrl, unpaidCheckoutOrder } from "@/lib/mobile-client";

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

  it("keeps an open checkout when only promo or pay-with changes", () => {
    expect(keepCheckoutOpen("details", true)).toBe(true);
    expect(keepCheckoutOpen("seat", true)).toBe(false);
    expect(orderToAbandon({ reopenCheckout: keepCheckoutOpen("details", true), orderId: "ord-1" })).toBeNull();
    expect(orderToAbandon({ reopenCheckout: keepCheckoutOpen("seat", true), orderId: "ord-1" })).toBe("ord-1");
  });

  it("does not book again when the checkout on screen has already settled", () => {
    markCheckoutSettled("ord-paid");
    expect(checkoutIsSettled("ord-paid")).toBe(true);
    expect(checkoutIsSettled("ord-open")).toBe(false);
    expect(settledCheckoutBlocksRebook({ reopenCheckout: false, orderId: "ord-paid", settled: true })).toBe(true);
    expect(settledCheckoutBlocksRebook({ reopenCheckout: true, orderId: "ord-paid", settled: true })).toBe(false);
    expect(settledCheckoutBlocksRebook({ reopenCheckout: false, orderId: "ord-open", settled: false })).toBe(false);
    expect(SETTLED_CHECKOUT_ERROR).toMatch(/already complete/i);
  });

  it("leaves web checkout on the https return page", () => {
    expect(mobileReturnTarget({ flow: "booking", cancelled: false, web: true })).toBeNull();
    expect(mobileReturnTarget({ flow: "booking", cancelled: true, web: true })).toBeNull();
    expect(mobileReturnTarget({ flow: "booking", cancelled: false, web: false })).toBe("becreative://bookings?flow=booking&paid=1");
    expect(mobileReturnTarget({ flow: "pack", cancelled: true, web: false })).toBe("becreative://bookings?flow=pack&cancelled=1");
  });
});
