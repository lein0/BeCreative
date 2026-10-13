import { describe, expect, it } from "vitest";
import { checkoutSessionOutcome } from "./outcome";

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
});
