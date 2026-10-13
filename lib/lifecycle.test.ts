import { describe, expect, it } from "vitest";
import { winbackEligible } from "@/lib/lifecycle";

const now = new Date("2026-10-13T12:00:00Z");

describe("win-back inactivity", () => {
  it("counts a recent visit and a visit-only customer", () => {
    const shared = { marketingOptIn: true, emailUnsubscribed: false, emailSuppressed: false, now, inactiveDays: 30 };
    expect(winbackEligible({ ...shared, classStarts: [new Date("2026-08-01T00:00:00Z")], visitStarts: [new Date("2026-10-01T00:00:00Z")] })).toBe(false);
    expect(winbackEligible({ ...shared, classStarts: [], visitStarts: [new Date("2026-08-01T00:00:00Z")] })).toBe(true);
    expect(winbackEligible({ ...shared, classStarts: [], visitStarts: [] })).toBe(false);
    expect(winbackEligible({ ...shared, marketingOptIn: false, classStarts: [], visitStarts: [new Date("2026-08-01T00:00:00Z")] })).toBe(false);
  });
});
