import { describe, expect, it } from "vitest";
import { disputeAcceptsEvidence, disputeLiability, earlyFraudDecision, evidenceForReason, refreshCheckedInEvidence, shouldAutoSubmit, type EvidencePacket } from "@/lib/dispute-evidence";

const packet: EvidencePacket = {
  customerName: "Jules Navarro",
  customerEmail: "student@becreative.demo",
  productDescription: "Scene Study with Maya Alvarez",
  sessionWhen: "2026-10-13 19:00",
  policyText: "Full refund until 24 hours before.",
  acceptedAt: "2026-10-01T18:00:00Z",
  acceptedIp: "203.0.113.8",
  policyVersion: 1,
  checkedIn: true,
  waiverSigned: "Jules Navarro signed version 1",
  messages: "Reminder email sent.",
  emailsSent: "You're booked.",
  serviceNotes: "In-person scene study, 120 minutes.",
  priorBookings: "2 completed bookings",
  refundExplanation: "One charge for one seat.",
};

describe("dispute evidence", () => {
  it("maps each reason onto the fields Stripe asks for", () => {
    expect(evidenceForReason("fraudulent", packet).access_activity_log).toContain("Check-in: yes");
    expect(evidenceForReason("fraudulent", packet).customer_purchase_ip).toBe("203.0.113.8");
    expect(evidenceForReason("product_not_received", packet).service_date).toContain("2026-10-13");
    expect(evidenceForReason("duplicate", packet).duplicate_charge_explanation).toContain("One charge");
    expect(evidenceForReason("subscription_canceled", packet).cancellation_policy).toContain("24 hours");
    expect(evidenceForReason("credit_not_processed", packet).refund_refusal_explanation).toContain("window");
    expect(evidenceForReason("general", packet).refund_policy).toContain("Accepted");
    expect(evidenceForReason("something_else", packet).customer_name).toBe("Jules Navarro");
  });

  it("submits immediately when attendance is confirmed, otherwise about 48 hours before the deadline", () => {
    const due = new Date("2026-10-20T00:00:00Z");
    expect(shouldAutoSubmit({ autoSubmit: true, held: false, attendanceConfirmed: true, dueBy: due, now: new Date("2026-10-10T00:00:00Z"), leadHours: 48 })).toBe(true);
    expect(shouldAutoSubmit({ autoSubmit: true, held: false, attendanceConfirmed: false, dueBy: due, now: new Date("2026-10-10T00:00:00Z"), leadHours: 48 })).toBe(false);
    expect(shouldAutoSubmit({ autoSubmit: true, held: false, attendanceConfirmed: false, dueBy: due, now: new Date("2026-10-18T00:00:00Z"), leadHours: 48 })).toBe(true);
    expect(shouldAutoSubmit({ autoSubmit: true, held: true, attendanceConfirmed: true, dueBy: due, now: new Date("2026-10-19T00:00:00Z"), leadHours: 48 })).toBe(false);
  });

  it("refunds an early fraud warning under $100 before the class, and flags the rest", () => {
    expect(earlyFraudDecision({ amountCents: 3600, classStarted: false, thresholdCents: 10000 })).toBe("refund");
    expect(earlyFraudDecision({ amountCents: 3600, classStarted: true, thresholdCents: 10000 })).toBe("flag");
    expect(earlyFraudDecision({ amountCents: 15000, classStarted: false, thresholdCents: 10000 })).toBe("flag");
  });

  it("puts the disputed amount on the teacher and the fee on the platform", () => {
    expect(disputeLiability({ amountCents: 3600, feeCents: 1500, amountBearer: "teacher", feeBearer: "platform" })).toEqual({
      teacherAmountCents: 3600,
      platformAmountCents: 0,
      teacherFeeCents: 0,
      platformFeeCents: 1500,
    });
  });

  it("refreshes a stale check-in and skips closed disputes", () => {
    const refreshed = refreshCheckedInEvidence({
      summary: "Check-in: no",
      evidence: { uncategorized_text: "Check-in: no", refund_policy: "kept" },
      incomingEvidence: { uncategorized_text: "Check-in: yes" },
      attendanceConfirmed: true,
    });
    expect(refreshed.summary).toBe("Check-in: yes");
    expect(refreshed.evidence.uncategorized_text).toBe("Check-in: yes");
    expect(refreshed.evidence.refund_policy).toBe("kept");
    expect(disputeAcceptsEvidence("lost")).toBe(false);
    expect(disputeAcceptsEvidence("won")).toBe(false);
    expect(disputeAcceptsEvidence("under_review")).toBe(true);
  });
});
