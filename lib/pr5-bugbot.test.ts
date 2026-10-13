import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { describedCancelOutcome } from "@/lib/cancel-policy";
import { classHasStarted, disputeUpdateFromStripe, nextDisputeSubmitAt, scopedDisputeRecords, withTeacherNotes } from "@/lib/dispute-evidence";
import { canAddDisputeNote, ticketCommandAllowed } from "@/lib/support-access";

const stranger = { isAdmin: false, isTicketTeacher: false, isOwner: false, resolved: false };
const owner = { isAdmin: false, isTicketTeacher: false, isOwner: true, resolved: true };
const studio = { isAdmin: false, isTicketTeacher: true, isOwner: false, resolved: false };
const admin = { isAdmin: true, isTicketTeacher: false, isOwner: false, resolved: true };

describe("ticket authorization", () => {
  it("blocks a signed-in stranger from replying, noting, resolving, or rating", () => {
    expect(ticketCommandAllowed(stranger, "reply")).toBe(false);
    expect(ticketCommandAllowed(stranger, "", true)).toBe(false);
    expect(ticketCommandAllowed(stranger, "resolve")).toBe(false);
    expect(ticketCommandAllowed({ ...stranger, resolved: true }, "csat")).toBe(false);
    expect(ticketCommandAllowed(stranger, "assign")).toBe(false);
  });

  it("lets the student rate and reply on their own ticket, and the studio reply or resolve", () => {
    expect(ticketCommandAllowed(owner, "reply")).toBe(true);
    expect(ticketCommandAllowed(owner, "csat")).toBe(true);
    expect(ticketCommandAllowed({ ...owner, resolved: false }, "csat")).toBe(false);
    expect(ticketCommandAllowed(owner, "reply", true)).toBe(false);
    expect(ticketCommandAllowed(owner, "resolve")).toBe(false);
    expect(ticketCommandAllowed(studio, "")).toBe(true);
    expect(ticketCommandAllowed(studio, "resolve")).toBe(true);
    expect(ticketCommandAllowed(studio, "", true)).toBe(false);
    expect(ticketCommandAllowed(admin, "assign")).toBe(true);
    expect(ticketCommandAllowed(admin, "csat")).toBe(true);
    expect(ticketCommandAllowed(admin, "reply", true)).toBe(true);
  });

  it("lets only the studio on the sale, or an admin, add a dispute note", () => {
    expect(canAddDisputeNote({ isAdmin: false, actorTeacherId: null, disputeTeacherId: "studio-a" })).toBe(false);
    expect(canAddDisputeNote({ isAdmin: false, actorTeacherId: "studio-b", disputeTeacherId: "studio-a" })).toBe(false);
    expect(canAddDisputeNote({ isAdmin: false, actorTeacherId: "studio-a", disputeTeacherId: "studio-a" })).toBe(true);
    expect(canAddDisputeNote({ isAdmin: true, actorTeacherId: null, disputeTeacherId: "studio-a" })).toBe(true);
  });
});

describe("dispute packet corrections", () => {
  it("keeps an edited summary and liability override when Stripe sends another event", () => {
    const next = disputeUpdateFromStripe(
      { summary: "ADMIN EDIT", evidence: { refund_policy: "kept" }, amountBearer: "platform", feeBearer: "teacher" },
      { summary: "rebuilt", evidence: { refund_policy: "fresh" }, amountBearer: "teacher", feeBearer: "platform", status: "under_review" },
    );
    expect(next.summary).toBe("ADMIN EDIT");
    expect(next.evidence).toEqual({ refund_policy: "kept" });
    expect(next.amountBearer).toBe("platform");
    expect(next.feeBearer).toBe("teacher");
    expect(next.status).toBe("under_review");
  });

  it("merges teacher notes into the filed summary and evidence", () => {
    const filed = withTeacherNotes("Packet", { uncategorized_text: "Session log" }, ["Student arrived late"]);
    expect(filed.summary).toContain("Student arrived late");
    expect(filed.evidence.uncategorized_text).toContain("Student arrived late");
    expect(filed.evidence.uncategorized_text).toContain("Session log");
  });

  it("drops other students' mail, other studios' waivers, and other studios' bookings", () => {
    const scoped = scopedDisputeRecords({
      teacherId: "studio-a",
      userId: "student-a",
      customerEmail: "a@example.com",
      emails: [
        { teacherId: "studio-a", toAddresses: ["a@example.com"], subject: "Your class reminder" },
        { teacherId: "studio-a", toAddresses: ["b@example.com"], subject: "Other student receipt" },
        { teacherId: "studio-b", toAddresses: ["a@example.com"], subject: "Another studio wrote" },
      ],
      waivers: [
        { userId: "student-a", teacherId: "studio-a", signedName: "Right Name" },
        { userId: "student-a", teacherId: "studio-b", signedName: "Other Studio Waiver" },
      ],
      bookings: [
        { userId: "student-a", classId: "class-a", status: "confirmed" },
        { userId: "student-a", classId: "class-b", status: "confirmed" },
        { userId: "student-b", classId: "class-a", status: "confirmed" },
      ],
      classTeacherIds: new Map([["class-a", "studio-a"], ["class-b", "studio-b"]]),
    });
    expect(scoped.emails.map((email) => email.subject)).toEqual(["Your class reminder"]);
    expect(scoped.waiver?.signedName).toBe("Right Name");
    expect(scoped.priorBookings).toHaveLength(1);
  });

  it("schedules another attempt when submit is early or Stripe is down", () => {
    const now = new Date("2026-10-01T00:00:00Z");
    const due = new Date("2026-10-20T00:00:00Z");
    expect(nextDisputeSubmitAt({ dueBy: due, leadHours: 48, now, retry: false }).toISOString()).toBe("2026-10-18T00:00:00.000Z");
    expect(nextDisputeSubmitAt({ dueBy: null, leadHours: 48, now, retry: true, attempts: 1 }).getTime() - now.getTime()).toBe(15 * 60 * 1000);
  });

  it("counts a series as started once any date has begun", () => {
    const now = new Date("2026-10-20T12:00:00Z");
    expect(classHasStarted([new Date("2026-10-22T12:00:00Z"), new Date("2026-10-18T12:00:00Z")], now)).toBe(true);
    expect(classHasStarted([new Date("2026-10-22T12:00:00Z")], now)).toBe(false);
  });
});

describe("booking help outcome", () => {
  const now = new Date("2026-10-20T12:00:00Z");

  it("uses the next upcoming session and the saved refund window", () => {
    const soon = new Date("2026-10-20T15:00:00Z");
    const far = new Date("2026-11-01T12:00:00Z");
    expect(describedCancelOutcome({ sessionStarts: [far, soon], now, fullRefundHours: 24, creditOnlyHours: 2 })).toBe("credit");
    expect(describedCancelOutcome({ sessionStarts: [], now, fullRefundHours: 24, creditOnlyHours: 2 })).toBe("already_started");
    const in30h = new Date(now.getTime() + 30 * 3_600_000);
    expect(describedCancelOutcome({ sessionStarts: [in30h], now, fullRefundHours: 48, creditOnlyHours: 2 })).toBe("credit");
    expect(describedCancelOutcome({ sessionStarts: [in30h], now, fullRefundHours: 24, creditOnlyHours: 2 })).toBe("full_refund");
  });

  it("reads the help page from the same preview, not the first link or ship defaults", () => {
    const source = readFileSync("app/(site)/bookings/[id]/help/page.tsx", "utf8");
    expect(source).toContain("describedCancelOutcome");
    expect(source).toContain("studentCancelPolicy");
    expect(source).not.toContain("SHIP_DEFAULTS");
    expect(source).not.toContain("links[0]");
    expect(readFileSync("lib/support.ts", "utf8")).toContain("/help/tickets/");
    expect(readFileSync("app/(site)/help/tickets/[id]/page.tsx", "utf8")).toContain('value="csat"');
    expect(readFileSync("instrumentation.ts", "utf8")).toContain("captureException");
    expect(readFileSync("app/error.tsx", "utf8")).toContain("reportErrorAction");
    expect(readFileSync("lib/auth.ts", "utf8")).toContain("sessionAllowedForUser");
  });
});
