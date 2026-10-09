import { describe, expect, it } from "vitest";
import { acceptLatest, authSessionRedirect, bookDisplayCents, bookingSubmitLock, checkoutFollowsBooking, fieldAutoCapitalize, packsForClass, PAYMENT_SHEET_RETURN_URL, paymentSheetForPlatform, postLoginPath, resumeBookingPath } from "@/lib/mobile-client";

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
  });

  it("does not open checkout for a series the student already has", () => {
    expect(checkoutFollowsBooking({ alreadyBooked: true })).toBe("bookings");
    expect(checkoutFollowsBooking({})).toBe("checkout");
  });

  it("lets only one continue tap create a booking", () => {
    const lock = bookingSubmitLock();
    expect(lock.tryAcquire()).toBe(true);
    expect(lock.tryAcquire()).toBe(false);
    lock.release();
    expect(lock.tryAcquire()).toBe(true);
  });
});
