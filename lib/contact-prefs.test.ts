import { describe, expect, it } from "vitest";
import { checkoutContactPatch } from "@/lib/contact-prefs";

describe("checkout contact prefs", () => {
  it("drops SMS opt-in when the phone changes and the box is unchecked", () => {
    expect(checkoutContactPatch({
      storedPhone: "+13105550100",
      phone: "+13105550199",
      sms: false,
      marketing: false,
    })).toEqual({ phone: "+13105550199", smsOptIn: false });
  });

  it("keeps SMS opt-in when the number is the same, including a differently typed form", () => {
    expect(checkoutContactPatch({
      storedPhone: "+13105550100",
      phone: "+13105550100",
      sms: false,
      marketing: false,
    })).toEqual({ phone: "+13105550100" });
    expect(checkoutContactPatch({
      storedPhone: "310-555-0100",
      phone: "+13105550100",
      sms: false,
      marketing: false,
    })).toEqual({ phone: "+13105550100" });
    expect(checkoutContactPatch({
      storedPhone: "+13105550100",
      phone: null,
      sms: false,
      marketing: false,
    })).toBeNull();
  });

  it("opts the new number in when the box is checked", () => {
    expect(checkoutContactPatch({
      storedPhone: "+13105550100",
      phone: "+13105550199",
      sms: true,
      marketing: false,
    })).toEqual({ phone: "+13105550199", smsOptIn: true });
  });
});
