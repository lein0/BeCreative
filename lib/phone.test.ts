import { describe, expect, it } from "vitest";
import { canonicalPhone, phoneDigitKeys, phoneForStorage, phonesMatch } from "@/lib/phone";

describe("phone format matching", () => {
  it("matches a provider E.164 number to a phone stored as typed", () => {
    expect(phonesMatch("+13105550100", "310-555-0100")).toBe(true);
    expect(phonesMatch("+13105550100", "(310) 555-0100")).toBe(true);
    expect(phonesMatch("+13105550100", "1-310-555-0100")).toBe(true);
    expect(phoneDigitKeys("+13105550100").sort()).toEqual(phoneDigitKeys("310-555-0100").sort());
    expect(phonesMatch("+13105550100", "310-555-0199")).toBe(false);
    expect(phonesMatch("+442079460958", "+44 20 7946 0958")).toBe(true);
  });

  it("stores a typed US number as E.164", () => {
    expect(phoneForStorage("310-555-0100")).toBe("+13105550100");
    expect(phoneForStorage("+1 (310) 555-0100")).toBe("+13105550100");
    expect(canonicalPhone("+13105550100")).toBe("+13105550100");
    expect(phoneForStorage("  ")).toBeNull();
  });
});
