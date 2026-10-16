import { describe, expect, it } from "vitest";
import { formatTimeInZone, timeInZone, zonedTimeToUtc } from "@/lib/time";

describe("Los Angeles time", () => {
  it("keeps 7pm local across the November DST change", () => {
    const before = zonedTimeToUtc("2026-10-27", "19:00");
    const after = zonedTimeToUtc("2026-11-03", "19:00");
    expect(before.toISOString()).toBe("2026-10-28T02:00:00.000Z");
    expect(after.toISOString()).toBe("2026-11-04T03:00:00.000Z");
    expect(timeInZone(before)).toBe("19:00");
    expect(timeInZone(after)).toBe("19:00");
    expect(formatTimeInZone(before)).toContain("7:00");
    expect(formatTimeInZone(after)).toContain("7:00");
  });
});
