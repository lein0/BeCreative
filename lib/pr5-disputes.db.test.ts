import { beforeEach, describe, expect, it, vi } from "vitest";

const stripeState = vi.hoisted(() => ({
  client: null as null | {
    files: { create: ReturnType<typeof vi.fn> };
    disputes: { update: ReturnType<typeof vi.fn> };
  },
}));

vi.mock("@/lib/db", async () => {
  const { createFakeDb } = await import("@/lib/test/fake-db");
  return { db: createFakeDb() };
});

vi.mock("@/lib/stripe", () => ({
  getStripe: () => stripeState.client,
  stripeConfigured: () => Boolean(stripeState.client),
}));

const { readTable, resetFakeDb, seedTable } = await import("@/lib/test/fake-db");
const schema = await import("@/lib/db/schema");
const { assemblePacket, handleEarlyFraud, recordDispute, submitDispute } = await import("@/lib/disputes");

describe("dispute persistence", () => {
  beforeEach(() => {
    resetFakeDb();
    stripeState.client = null;
  });

  it("does not let a later Stripe event replace an edited packet, and requeues a finished submit", async () => {
    await recordDispute({ id: "dp_1", amountCents: 3600, reason: "general", status: "needs_response" });
    const dispute = readTable(schema.disputes)[0]!;
    dispute.summary = "ADMIN EDIT";
    dispute.evidence = { refund_policy: "kept" };
    dispute.amountBearer = "platform";
    dispute.feeBearer = "teacher";
    const job = readTable(schema.jobs)[0]!;
    job.status = "done";
    await recordDispute({ id: "dp_1", amountCents: 3600, reason: "fraudulent", status: "under_review", feeCents: 1500 });
    expect(dispute.summary).toBe("ADMIN EDIT");
    expect(dispute.evidence).toEqual({ refund_policy: "kept" });
    expect(dispute.amountBearer).toBe("platform");
    expect(dispute.feeBearer).toBe("teacher");
    expect(dispute.status).toBe("under_review");
    expect(job.status).toBe("queued");
    expect(job.attempts).toBe(0);
  });

  it("leaves the dispute unsubmitted when Stripe is not configured", async () => {
    seedTable(schema.disputes, [{
      id: "dp_2",
      evidenceStatus: "assembling",
      attendanceConfirmed: true,
      summary: "Packet",
      evidence: { refund_policy: "policy" },
      dueBy: null,
      reason: "general",
    }]);
    const result = await submitDispute("dp_2");
    expect(result.retry).toBe(true);
    expect(result.ok).toBe(false);
    expect(readTable(schema.disputes)[0]?.evidenceStatus).toBe("assembling");
  });

  it("asks again later instead of closing the job before the lead window", async () => {
    const due = new Date(Date.now() + 10 * 24 * 3_600_000);
    seedTable(schema.disputes, [{
      id: "dp_4",
      evidenceStatus: "assembling",
      attendanceConfirmed: false,
      summary: "Packet",
      evidence: {},
      dueBy: due,
      reason: "general",
    }]);
    const result = await submitDispute("dp_4");
    expect(result.waiting).toBe(true);
    expect(result.runAt!.getTime()).toBeGreaterThan(Date.now() + 3_600_000);
    expect(readTable(schema.disputes)[0]?.evidenceStatus).toBe("assembling");
  });

  it("files teacher notes with the Stripe evidence", async () => {
    const update = vi.fn(async () => ({}));
    const create = vi.fn(async () => ({ id: "file_1" }));
    stripeState.client = { files: { create }, disputes: { update } };
    seedTable(schema.disputes, [{
      id: "dp_3",
      evidenceStatus: "assembling",
      attendanceConfirmed: true,
      summary: "Packet",
      evidence: { uncategorized_text: "Session log" },
      dueBy: null,
      reason: "general",
    }]);
    seedTable(schema.disputeNotes, [{ id: "n1", disputeId: "dp_3", body: "Student arrived late" }]);
    const result = await submitDispute("dp_3");
    expect(result.ok).toBe(true);
    expect(readTable(schema.disputes)[0]?.evidenceStatus).toBe("submitted");
    const filed = update.mock.calls[0] as unknown as [string, { evidence: { uncategorized_text: string } }];
    const evidence = filed[1].evidence.uncategorized_text;
    expect(evidence).toContain("Student arrived late");
    const file = (create.mock.calls[0] as unknown as [{ file: { data: Buffer } }])[0].file.data;
    expect(Buffer.from(file ?? "").toString("latin1")).toContain("Student arrived late");
  });

  it("flags early fraud when an earlier series date already started", async () => {
    const now = Date.now();
    seedTable(schema.orders, [{
      id: "ord_1",
      stripePaymentIntentId: "pi_1",
      studentPaysCents: 3600,
      platformFeeCents: 360,
      teacherAmountCents: 3240,
      refundedCents: 0,
      status: "paid",
    }]);
    seedTable(schema.bookings, [{ id: "book_1", orderId: "ord_1", classId: "class_1", userId: "user_1", status: "confirmed" }]);
    seedTable(schema.bookingSessions, [
      { id: "l1", bookingId: "book_1", sessionId: "future" },
      { id: "l2", bookingId: "book_1", sessionId: "past" },
    ]);
    seedTable(schema.sessions, [
      { id: "future", startsAt: new Date(now + 5 * 24 * 3_600_000) },
      { id: "past", startsAt: new Date(now - 24 * 3_600_000) },
    ]);
    const started = await handleEarlyFraud({ chargeId: "ch_1", paymentIntentId: "pi_1", amountCents: 3600 });
    expect(started.decision).toBe("flag");
    expect(readTable(schema.refundLedger)).toHaveLength(0);

    resetFakeDb();
    seedTable(schema.orders, [{
      id: "ord_1",
      stripePaymentIntentId: "pi_1",
      studentPaysCents: 3600,
      platformFeeCents: 360,
      teacherAmountCents: 3240,
      refundedCents: 0,
      status: "paid",
    }]);
    seedTable(schema.bookings, [{ id: "book_1", orderId: "ord_1", classId: "class_1", userId: "user_1", status: "confirmed" }]);
    seedTable(schema.bookingSessions, [
      { id: "l1", bookingId: "book_1", sessionId: "future-a" },
      { id: "l2", bookingId: "book_1", sessionId: "future-b" },
    ]);
    seedTable(schema.sessions, [
      { id: "future-a", startsAt: new Date(now + 2 * 24 * 3_600_000) },
      { id: "future-b", startsAt: new Date(now + 9 * 24 * 3_600_000) },
    ]);
    const upcoming = await handleEarlyFraud({ chargeId: "ch_2", paymentIntentId: "pi_1", amountCents: 3600 });
    expect(upcoming.decision).toBe("refund");
    expect(readTable(schema.refundLedger)).toHaveLength(1);
  });

  it("builds the packet from this customer's studio records only", async () => {
    seedTable(schema.orders, [{ id: "ord_1", userId: "student-a", teacherId: "studio-a", kind: "session", studentPaysCents: 3600, refundedCents: 0 }]);
    seedTable(schema.user, [{ id: "student-a", name: "Ava", email: "a@example.com" }]);
    seedTable(schema.bookings, [
      { id: "book-a", orderId: "ord_1", classId: "class-a", userId: "student-a", status: "confirmed" },
      { id: "book-other-studio", orderId: "ord_x", classId: "class-b", userId: "student-a", status: "confirmed" },
      { id: "book-other-student", orderId: "ord_y", classId: "class-a", userId: "student-b", status: "confirmed" },
    ]);
    seedTable(schema.classes, [
      { id: "class-a", teacherId: "studio-a", title: "Scene study", description: "In the room", whatToBring: "A notebook", outcomes: "" },
      { id: "class-b", teacherId: "studio-b", title: "Other", description: "", whatToBring: "", outcomes: "" },
    ]);
    seedTable(schema.bookingSessions, [{ id: "link-1", bookingId: "book-a", sessionId: "sess-1", checkedIn: true }]);
    seedTable(schema.sessions, [{ id: "sess-1", startsAt: new Date("2026-10-13T19:00:00Z") }]);
    seedTable(schema.emailOutbox, [
      { id: "e1", teacherId: "studio-a", toAddresses: ["a@example.com"], subject: "Your class reminder" },
      { id: "e2", teacherId: "studio-a", toAddresses: ["b@example.com"], subject: "Other student receipt" },
      { id: "e3", teacherId: "studio-b", toAddresses: ["a@example.com"], subject: "Another studio wrote" },
    ]);
    seedTable(schema.waiverSignatures, [
      { id: "w1", userId: "student-a", teacherId: "studio-a", signedName: "Right Name", version: 1, signedAt: new Date("2026-10-01T00:00:00Z"), ip: "203.0.113.8" },
      { id: "w2", userId: "student-a", teacherId: "studio-b", signedName: "Other Studio Waiver", version: 1, signedAt: new Date("2026-10-01T00:00:00Z"), ip: "203.0.113.9" },
    ]);
    const packet = await assemblePacket("ord_1");
    expect(packet.emailsSent).toContain("Your class reminder");
    expect(packet.emailsSent).not.toContain("Other student receipt");
    expect(packet.emailsSent).not.toContain("Another studio wrote");
    expect(packet.waiverSigned).toContain("Right Name");
    expect(packet.waiverSigned).not.toContain("Other Studio Waiver");
    expect(packet.priorBookings).toBe("1");
  });

  it("treats a started visit as attended and records its time", async () => {
    const now = Date.now();
    seedTable(schema.orders, [{ id: "ord_v", stripePaymentIntentId: "pi_v", kind: "visit", studentPaysCents: 5000, refundedCents: 0, status: "paid", teacherId: "studio-a" }]);
    seedTable(schema.services, [{ id: "svc_1", title: "Sauna", description: "Heat", teacherId: "studio-a" }]);
    seedTable(schema.visitBookings, [{ id: "vis_1", orderId: "ord_v", serviceId: "svc_1", startsAt: new Date(now - 3_600_000), status: "confirmed" }]);
    const packet = await assemblePacket("ord_v");
    expect(packet.productDescription).toContain("Sauna");
    expect(packet.sessionWhen).not.toBe("not recorded");
    const started = await handleEarlyFraud({ chargeId: "ch_v", paymentIntentId: "pi_v", amountCents: 5000 });
    expect(started.decision).toBe("flag");
    expect(readTable(schema.refundLedger)).toHaveLength(0);
  });

  it("does not auto-submit a closed dispute, and updates a later check-in", async () => {
    await recordDispute({ id: "dp_lost", amountCents: 1000, reason: "general", status: "lost" });
    expect(readTable(schema.jobs).filter((job) => job.kind === "dispute.submit")).toHaveLength(0);
    const skipped = await submitDispute("dp_lost");
    expect(skipped.skipped).toBe(true);

    seedTable(schema.orders, [{ id: "ord_ci", stripePaymentIntentId: "pi_ci", userId: "student-a", teacherId: "studio-a", kind: "booking", studentPaysCents: 2000, refundedCents: 0 }]);
    seedTable(schema.user, [{ id: "student-a", name: "Ava", email: "a@example.com" }]);
    seedTable(schema.classes, [{ id: "class-a", teacherId: "studio-a", title: "Floor", description: "Move", whatToBring: "", outcomes: "" }]);
    seedTable(schema.bookings, [{ id: "book-ci", orderId: "ord_ci", classId: "class-a", userId: "student-a", status: "confirmed" }]);
    seedTable(schema.bookingSessions, [{ id: "link-ci", bookingId: "book-ci", sessionId: "sess-ci", checkedIn: false }]);
    seedTable(schema.sessions, [{ id: "sess-ci", startsAt: new Date("2026-10-13T19:00:00Z") }]);
    await recordDispute({ id: "dp_ci", paymentIntentId: "pi_ci", amountCents: 2000, reason: "general", status: "needs_response" });
    const dispute = readTable(schema.disputes).find((row) => row.id === "dp_ci")!;
    const evidence = () => dispute.evidence as { uncategorized_text?: string };
    expect(String(evidence().uncategorized_text)).toContain("Check-in: no");
    readTable(schema.bookingSessions)[0]!.checkedIn = true;
    await recordDispute({ id: "dp_ci", paymentIntentId: "pi_ci", amountCents: 2000, reason: "general", status: "under_review" });
    expect(String(evidence().uncategorized_text)).toContain("Check-in: yes");
    expect(dispute.attendanceConfirmed).toBe(true);
  });
});
