import { describe, expect, it } from "vitest";
import { matchesLocalDay } from "./format";

describe("local day filter", () => {
  it("keeps an evening Los Angeles class on that local date, not the next UTC date", () => {
    const evening = "2026-10-17T03:00:00.000Z";
    expect(matchesLocalDay(evening, "2026-10-16")).toBe(true);
    expect(matchesLocalDay(evening, "2026-10-17")).toBe(false);
  });

  it("drops a class that has no next date when a day is selected", () => {
    expect(matchesLocalDay(null, "2026-10-16")).toBe(false);
    expect(matchesLocalDay(null, "")).toBe(true);
  });
});
