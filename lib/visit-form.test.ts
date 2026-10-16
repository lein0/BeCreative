import { describe, expect, it } from "vitest";
import { privateVisitOptions, secondPrivateMinutesDefault, secondPrivatePriceDefault } from "@/lib/visit-form";

describe("private visit form", () => {
  it("keeps a single length when the second price is left blank", () => {
    expect(secondPrivateMinutesDefault).toBe("");
    expect(secondPrivatePriceDefault).toBe("");
    expect(privateVisitOptions({
      minutesA: "60",
      priceA: "90",
      minutesB: secondPrivateMinutesDefault,
      priceB: secondPrivatePriceDefault,
    })).toEqual([{ label: "60 min", minutes: 60, priceCents: 9000 }]);
  });

  it("saves a second length only when its price is filled in", () => {
    expect(privateVisitOptions({ minutesA: "60", priceA: "90", minutesB: "90", priceB: "120" })).toEqual([
      { label: "60 min", minutes: 60, priceCents: 9000 },
      { label: "90 min", minutes: 90, priceCents: 12000 },
    ]);
  });
});
