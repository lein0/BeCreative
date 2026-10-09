import { describe, expect, it } from "vitest";
import { authSessionRedirect } from "./outcome";

describe("checkout return", () => {
  it("sends web checkout back to the public return page, not cookie-gated bookings", () => {
    expect(authSessionRedirect("web", "https://classes.becreative.app/", "becreative://bookings")).toBe("https://classes.becreative.app/mobile/return");
    expect(authSessionRedirect("ios", "https://classes.becreative.app", "becreative://bookings")).toBe("becreative://bookings");
  });
});
