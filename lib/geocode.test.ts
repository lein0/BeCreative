import { describe, expect, it } from "vitest";
import { coordinatesForVisit, LocalGeocoder } from "@/lib/geocode";

describe("visit coordinates", () => {
  it("uses the typed neighborhood instead of Silver Lake", async () => {
    const venice = await coordinatesForVisit(
      { address: "1 Abbot Kinney", neighborhood: "Venice", city: "Los Angeles" },
      new LocalGeocoder(),
    );
    const silverLake = await coordinatesForVisit(
      { address: "1 Sunset", neighborhood: "Silver Lake", city: "Los Angeles" },
      new LocalGeocoder(),
    );
    expect(venice.lat).toBeCloseTo(33.985, 1);
    expect(venice.lng).toBeCloseTo(-118.4695, 1);
    expect(Math.abs(venice.lat - 34.0869)).toBeGreaterThan(0.05);
    expect(Math.abs(silverLake.lat - venice.lat)).toBeGreaterThan(0.05);
  });
});
