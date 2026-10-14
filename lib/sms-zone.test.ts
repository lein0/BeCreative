import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { deviceTimeZone, pickActivityTimeZone, smsHrefTarget, syncDeviceTimeZone, teacherActivityTimeZone } from "@/lib/sms-zone";

describe("SMS activity zone", () => {
  it("reads visit slugs as well as class slugs", () => {
    expect(smsHrefTarget("/s/private-yoga")).toEqual({ kind: "visit", slug: "private-yoga" });
    expect(smsHrefTarget("/s/private-yoga?cancelled=1")).toEqual({ kind: "visit", slug: "private-yoga" });
    expect(smsHrefTarget("https://classes.example/s/cedar-sauna")).toEqual({ kind: "visit", slug: "cedar-sauna" });
    expect(smsHrefTarget("/c/scene-study")).toEqual({ kind: "class", slug: "scene-study" });
    expect(smsHrefTarget("/bookings")).toBeNull();
  });

  it("uses the soonest upcoming activity, including a visit ahead of an older class", () => {
    const now = Date.parse("2026-10-14T18:00:00.000Z");
    expect(pickActivityTimeZone([
      { startsAt: Date.parse("2026-10-20T18:00:00.000Z"), timeZone: "America/Chicago" },
      { startsAt: Date.parse("2026-10-15T15:00:00.000Z"), timeZone: "America/New_York" },
    ], now)).toBe("America/New_York");
    expect(pickActivityTimeZone([
      { startsAt: Date.parse("2026-10-01T15:00:00.000Z"), timeZone: "America/Chicago" },
      { startsAt: Date.parse("2026-10-10T15:00:00.000Z"), timeZone: "America/Denver" },
    ], now)).toBe("America/Denver");
    expect(teacherActivityTimeZone([
      { locationId: "la", timeZone: "America/Los_Angeles" },
      { locationId: "nyc", timeZone: "America/New_York" },
    ], "nyc")).toBe("America/New_York");
    expect(teacherActivityTimeZone([
      { locationId: "la", timeZone: "America/Los_Angeles" },
    ], "missing")).toBe("America/Los_Angeles");
  });

  it("saves the device zone from the signed-in mobile session", async () => {
    const bodies: { timezone: string }[] = [];
    const saved = await syncDeviceTimeZone(async (body) => {
      bodies.push(body);
    });
    expect(saved).toBe(true);
    expect(bodies[0]?.timezone).toBe(deviceTimeZone());
    const session = readFileSync("mobile/src/session.tsx", "utf8");
    expect(session).toContain("syncDeviceTimeZone");
    const api = readFileSync("lib/mobile-api.ts", "utf8");
    expect(api).toContain("timezone");
    expect(api).toContain("usableTimeZone");
  });
});
