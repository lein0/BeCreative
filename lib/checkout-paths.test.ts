import { describe, expect, it } from "vitest";
import { checkoutPaths } from "@/lib/booking-service";

describe("mobile checkout return paths", () => {
  it("puts paid and cancelled on the public return page", () => {
    expect(checkoutPaths(true, "booking", "/bookings?paid=1", "/c/scene?cancelled=1")).toEqual({
      successPath: "/mobile/return?flow=booking&paid=1",
      cancelPath: "/mobile/return?flow=booking&cancelled=1",
    });
    expect(checkoutPaths(false, "pack", "/bookings?pack=1", "/t/studio")).toEqual({
      successPath: "/bookings?pack=1",
      cancelPath: "/t/studio",
    });
  });
});
