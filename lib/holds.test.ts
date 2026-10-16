import { afterEach, describe, expect, it } from "vitest";
import { checkoutHoldMinutes, isCheckoutHoldExpired } from "@/lib/holds";

const original = process.env.CHECKOUT_HOLD_MINUTES;

afterEach(() => {
  if (original === undefined) delete process.env.CHECKOUT_HOLD_MINUTES;
  else process.env.CHECKOUT_HOLD_MINUTES = original;
});

describe("checkout holds", () => {
  const created = new Date("2026-10-07T18:00:00Z");

  it("expires an unpaid hold at 30 minutes and keeps a newer one", () => {
    delete process.env.CHECKOUT_HOLD_MINUTES;
    expect(checkoutHoldMinutes()).toBe(30);
    expect(isCheckoutHoldExpired(created, new Date("2026-10-07T18:29:59Z"))).toBe(false);
    expect(isCheckoutHoldExpired(created, new Date("2026-10-07T18:30:00Z"))).toBe(true);
  });

  it("uses CHECKOUT_HOLD_MINUTES when it is a positive number", () => {
    process.env.CHECKOUT_HOLD_MINUTES = "10";
    expect(checkoutHoldMinutes()).toBe(10);
    expect(isCheckoutHoldExpired(created, new Date("2026-10-07T18:09:00Z"), checkoutHoldMinutes())).toBe(false);
    expect(isCheckoutHoldExpired(created, new Date("2026-10-07T18:10:00Z"), checkoutHoldMinutes())).toBe(true);
  });

  it("falls back to 30 minutes for a blank or invalid setting", () => {
    process.env.CHECKOUT_HOLD_MINUTES = "nope";
    expect(checkoutHoldMinutes()).toBe(30);
    process.env.CHECKOUT_HOLD_MINUTES = "0";
    expect(checkoutHoldMinutes()).toBe(30);
  });
});
