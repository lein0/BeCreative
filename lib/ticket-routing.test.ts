import { describe, expect, it } from "vitest";
import { routeTicket } from "@/lib/ticket-routing";

const created = new Date("2026-10-08T12:00:00Z");

describe("ticket routing", () => {
  it("sends class issues to the teacher and escalates after a day without a reply", () => {
    expect(routeTicket({ category: "class", createdAt: created, now: new Date("2026-10-08T18:00:00Z"), slaHours: 24, teacherReplied: false }).owner).toBe("teacher");
    expect(routeTicket({ category: "booking", createdAt: created, now: new Date("2026-10-09T13:00:00Z"), slaHours: 24, teacherReplied: false })).toMatchObject({ owner: "admin", reason: "sla" });
    expect(routeTicket({ category: "class", createdAt: created, now: new Date("2026-10-09T13:00:00Z"), slaHours: 24, teacherReplied: true }).owner).toBe("teacher");
  });

  it("sends payment and safety issues to admin immediately", () => {
    expect(routeTicket({ category: "payment", createdAt: created, now: created, slaHours: 24, teacherReplied: false }).reason).toBe("payment_or_safety");
    expect(routeTicket({ category: "safety", createdAt: created, now: created, slaHours: 24, teacherReplied: false }).owner).toBe("admin");
  });
});
