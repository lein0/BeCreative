import { describe, expect, it } from "vitest";
import { describeRecurrence, diffSessions, previewOccurrences, type RecurrenceRule } from "@/lib/recurrence";
import { timeInZone } from "@/lib/time";

const base: RecurrenceRule = {
  timezone: "America/Los_Angeles",
  frequency: "weekly",
  days: [
    { weekday: 2, time: "19:00" },
    { weekday: 4, time: "19:00" },
  ],
  startDate: "2026-10-13",
  endType: "after",
  endCount: 8,
};

describe("recurrence", () => {
  it("describes a weekly class in plain English", () => {
    expect(describeRecurrence(base)).toBe("Every Tue & Thu at 7:00 PM, starting Oct 13, 8 sessions");
  });

  it("generates eight Tue/Thu sessions and stays at 7pm after DST", () => {
    const dates = previewOccurrences(base, 75);
    expect(dates).toHaveLength(8);
    expect(dates.map((item) => item.date)).toEqual([
      "2026-10-13",
      "2026-10-15",
      "2026-10-20",
      "2026-10-22",
      "2026-10-27",
      "2026-10-29",
      "2026-11-03",
      "2026-11-05",
    ]);
    expect(timeInZone(dates[6]!.startsAt)).toBe("19:00");
    expect(dates[0]!.endsAt.getTime() - dates[0]!.startsAt.getTime()).toBe(75 * 60_000);
  });

  it("supports a different time per day, biweekly, and monthly by weekday", () => {
    const mixed = describeRecurrence({
      ...base,
      endType: "never",
      days: [
        { weekday: 2, time: "19:00" },
        { weekday: 4, time: "18:30" },
      ],
    });
    expect(mixed).toContain("Tue at 7:00 PM");
    expect(mixed).toContain("Thu at 6:30 PM");
    expect(mixed).toContain("ongoing");

    const biweekly = previewOccurrences({ ...base, frequency: "biweekly", days: [{ weekday: 1, time: "18:00" }], endType: "after", endCount: 3 }, 60);
    expect(biweekly.map((item) => item.date)).toEqual(["2026-10-19", "2026-11-02", "2026-11-16"]);

    const monthly = previewOccurrences(
      { ...base, frequency: "monthly", days: [{ weekday: 2, time: "19:00" }], endType: "after", endCount: 3, startDate: "2026-10-13" },
      60,
    );
    expect(monthly.map((item) => item.date)).toEqual(["2026-10-13", "2026-11-10", "2026-12-08"]);
    expect(describeRecurrence({ ...base, frequency: "monthly", days: [{ weekday: 2, time: "19:00" }], endType: "on", endDate: "2026-12-31" })).toContain("2nd Tue");
  });

  it("keeps booked sessions and exceptions when the rule changes", () => {
    const diff = diffSessions(
      [
        { id: "a", date: "2026-10-13", hasBookings: false, exception: null },
        { id: "b", date: "2026-10-15", hasBookings: true, exception: null },
        { id: "c", date: "2026-10-20", hasBookings: false, exception: "moved" },
      ],
      ["2026-10-13", "2026-10-22"],
    );
    expect(diff.keepIds).toEqual(["a", "c"]);
    expect(diff.cancelIds).toEqual(["b"]);
    expect(diff.deleteIds).toEqual([]);
    expect(diff.createDates).toEqual(["2026-10-22"]);
  });
});
