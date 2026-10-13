import { describe, expect, it } from "vitest";
import { exploreShowsVisits, milesBetween, visitDurationMinutes, visitListPriceCents, visitMatchesExploreFilters, type VisitListing } from "@/lib/explore-filters";

function visit(overrides: Partial<VisitListing> = {}): VisitListing {
  return {
    title: "Private yoga",
    studioName: "Still",
    categoryName: "Yoga",
    categorySlug: "yoga",
    priceCents: 9000,
    lat: 33.985,
    lng: -118.4695,
    windows: [{ weekday: 1, start: "09:00", end: "12:00" }],
    durationMinutes: 60,
    leadTimeHours: 0,
    ...overrides,
  };
}

describe("wellness explore filters", () => {
  it("applies neighborhood, price, and date the same way classes do", () => {
    const santaMonica = { lat: 34.0195, lng: -118.4912 };
    expect(milesBetween(santaMonica.lat, santaMonica.lng, 33.985, -118.4695)).toBeLessThan(8);
    expect(visitMatchesExploreFilters(visit(), { ...santaMonica, miles: 8 })).toBe(true);
    expect(visitMatchesExploreFilters(visit({ lat: 34.0869, lng: -118.2702 }), { ...santaMonica, miles: 8 })).toBe(false);
    expect(visitMatchesExploreFilters(visit({ lat: null, lng: null }), { ...santaMonica, miles: 8 })).toBe(false);
    expect(visitMatchesExploreFilters(visit({ priceCents: 14000 }), { maxPrice: 100 })).toBe(false);
    expect(visitMatchesExploreFilters(visit({ priceCents: 4000 }), { maxPrice: 50 })).toBe(true);
    const morning = new Date("2026-10-12T08:00:00Z");
    expect(visitMatchesExploreFilters(visit(), { date: "2026-10-12", now: morning, timeZone: "UTC" })).toBe(true);
    expect(visitMatchesExploreFilters(visit(), { date: "2026-10-19", now: morning, timeZone: "UTC" })).toBe(true);
    expect(visitMatchesExploreFilters(visit(), { date: "2026-10-20", now: morning, timeZone: "UTC" })).toBe(false);
    expect(visitMatchesExploreFilters(visit({ windows: [] }), { date: "2026-10-12", now: morning, timeZone: "UTC" })).toBe(false);
    expect(visitMatchesExploreFilters(visit(), { q: "still", category: "yoga" })).toBe(true);
    expect(visitMatchesExploreFilters(visit(), { category: "massage" })).toBe(false);
  });

  it("includes visits on the combined explore view and hides them for creative only", () => {
    expect(exploreShowsVisits("")).toBe(true);
    expect(exploreShowsVisits("wellness")).toBe(true);
    expect(exploreShowsVisits("creative")).toBe(false);
  });

  it("prices a private hour from its shortest option", () => {
    expect(visitListPriceCents("appointment", 0, [12000, 9000])).toBe(9000);
    expect(visitListPriceCents("access", 2800, [])).toBe(2800);
    expect(visitDurationMinutes("appointment", null, [90, 60])).toBe(60);
    expect(visitDurationMinutes("access", 30, [])).toBe(30);
  });
});
