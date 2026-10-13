import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", async () => {
  const { createFakeDb } = await import("@/lib/test/fake-db");
  return { db: createFakeDb() };
});

const { readTable, resetFakeDb, seedTable } = await import("@/lib/test/fake-db");
const schema = await import("@/lib/db/schema");
const { setCheckin } = await import("@/lib/studio-service");

describe("roster check-in", () => {
  beforeEach(() => {
    resetFakeDb();
  });

  it("refreshes an open dispute when the studio checks the student in", async () => {
    const due = new Date(Date.now() + 10 * 24 * 3_600_000);
    seedTable(schema.classes, [{ id: "class-a", teacherId: "studio-a" }]);
    seedTable(schema.sessions, [{ id: "sess-1", classId: "class-a", startsAt: new Date("2026-10-13T19:00:00.000Z") }]);
    seedTable(schema.bookings, [{ id: "book-1", orderId: "ord-1", classId: "class-a", userId: "student-a", status: "confirmed" }]);
    seedTable(schema.bookingSessions, [{ id: "link-1", bookingId: "book-1", sessionId: "sess-1", checkedIn: false }]);
    seedTable(schema.disputes, [{
      id: "dp_roster",
      orderId: "ord-1",
      evidenceStatus: "assembling",
      attendanceConfirmed: false,
      status: "needs_response",
      summary: "Check-in: no",
      evidence: { uncategorized_text: "Check-in: no" },
      dueBy: due,
      reason: "general",
    }]);
    seedTable(schema.jobs, [{
      id: "job-roster",
      kind: "dispute.submit",
      payload: { disputeId: "dp_roster" },
      status: "queued",
      runAt: new Date(due.getTime() - 48 * 3_600_000),
      attempts: 0,
      idempotencyKey: "dispute-submit:dp_roster",
    }]);
    await setCheckin("link-1", true, "studio-a");
    const dispute = readTable(schema.disputes)[0]!;
    expect(readTable(schema.bookingSessions)[0]?.checkedIn).toBe(true);
    expect(dispute.attendanceConfirmed).toBe(true);
    expect(String((dispute.evidence as { uncategorized_text?: string }).uncategorized_text)).toContain("Check-in: yes");
    expect((readTable(schema.jobs)[0]?.runAt as Date).getTime()).toBeLessThan(Date.now() + 5_000);
  });
});
