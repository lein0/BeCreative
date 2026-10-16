import { describe, expect, it } from "vitest";
import { checkoutReturnAction, checkoutSessionOutcome } from "./outcome";

describe("checkout session outcome", () => {
  it("does not treat a cancelled return or a closed sheet as a paid booking", () => {
    expect(checkoutSessionOutcome({ type: "success", url: "becreative://bookings?flow=membership&cancelled=1" })).toBe("cancel");
    expect(checkoutSessionOutcome({ type: "success", url: "becreative://bookings?flow=booking" })).toBe("dismiss");
    expect(checkoutSessionOutcome({ type: "dismiss" })).toBe("dismiss");
    expect(checkoutSessionOutcome({ type: "cancel", url: "becreative://bookings?paid=1" })).toBe("cancel");
  });

  it("marks the booking paid only when the return URL says so", () => {
    expect(checkoutSessionOutcome({ type: "success", url: "becreative://bookings?flow=booking&paid=1" })).toBe("success");
    expect(checkoutSessionOutcome({ type: "success", url: "https://classes.becreative.app/bookings?pack=1" })).toBe("success");
    expect(checkoutSessionOutcome({ type: "success", url: "https://classes.becreative.app/bookings?membership=1" })).toBe("success");
  });

  it("keeps a cancelled pack or membership checkout on the offer", () => {
    expect(checkoutReturnAction("success")).toEqual({ proceed: true, message: null });
    expect(checkoutReturnAction("cancel").proceed).toBe(false);
    expect(checkoutReturnAction("cancel").message).toMatch(/cancelled/i);
    expect(checkoutReturnAction("dismiss").proceed).toBe(false);
  });
});
