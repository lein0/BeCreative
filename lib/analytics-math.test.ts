import { describe, expect, it } from "vitest";
import { assignVariant, funnelReport, twoProportionZ } from "@/lib/analytics-math";

describe("funnel math", () => {
  it("computes step conversion and drop-off from the previous step", () => {
    const report = funnelReport([
      { name: "visit", count: 100 },
      { name: "class_viewed", count: 40 },
      { name: "paid", count: 10 },
    ]);
    expect(report[1]).toMatchObject({ conversion: 0.4, dropOff: 0.6, fromStart: 0.4 });
    expect(report[2]).toMatchObject({ conversion: 0.25, dropOff: 0.75, fromStart: 0.1 });
    expect(funnelReport([{ name: "visit", count: 0 }])[0]?.conversion).toBe(0);
  });
});

describe("experiment assignment", () => {
  const variants = [
    { key: "book_this", weight: 50 },
    { key: "save_seat", weight: 50 },
  ];

  it("stays on the same variant for the same person and experiment", () => {
    const first = assignVariant("anon_123", "class_cta", variants);
    expect(assignVariant("anon_123", "class_cta", variants)).toBe(first);
    expect(assignVariant("anon_999", "class_cta", [{ key: "only", weight: 1 }])).toBe("only");
  });
});

describe("significance", () => {
  it("flags a large conversion gap and ignores a tiny one", () => {
    const strong = twoProportionZ({ success: 40, total: 200 }, { success: 80, total: 200 });
    expect(strong.significant).toBe(true);
    expect(strong.uplift).toBeCloseTo(1);
    const weak = twoProportionZ({ success: 40, total: 200 }, { success: 42, total: 200 });
    expect(weak.significant).toBe(false);
    expect(twoProportionZ({ success: 0, total: 0 }, { success: 1, total: 10 }).p).toBe(1);
  });
});
