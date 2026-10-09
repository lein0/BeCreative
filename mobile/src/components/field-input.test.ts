import { describe, expect, it } from "vitest";
import { fieldAutoCapitalize } from "./field-input";

describe("field capitalization", () => {
  it("does not capitalize passwords, emails, or phone numbers", () => {
    expect(fieldAutoCapitalize("default", true)).toBe("none");
    expect(fieldAutoCapitalize("email-address")).toBe("none");
    expect(fieldAutoCapitalize("phone-pad")).toBe("none");
    expect(fieldAutoCapitalize("default", false)).toBe("sentences");
  });
});
