import { and, arrayContains, eq, inArray } from "drizzle-orm";
import { classHasStarted, disputeLiability, disputeUpdateFromStripe, disputeAcceptsEvidence, earlyFraudDecision, evidenceForReason, nextDisputeSubmitAt, refreshCheckedInEvidence, scopedDisputeRecords, shouldAutoSubmit, withTeacherNotes, type EvidencePacket } from "@/lib/dispute-evidence";
import { textPdf } from "@/lib/evidence-pdf";
import { db } from "@/lib/db";
import { auditLog, bookingSessions, bookings, classes, disputeNotes, disputes, emailOutbox, orders, platformSettings, policyAcceptances, services, sessions, teachers, user, visitBookings, waiverSignatures } from "@/lib/db/schema";
import { ensureQueuedJob } from "@/lib/jobs";
import { emitNotification } from "@/lib/notifications";
import { issueRefund } from "@/lib/refunds";
import { SHIP_DEFAULTS } from "@/lib/ship-defaults";
import { getStripe } from "@/lib/stripe";

async function settings() {
  const [row] = await db.select().from(platformSettings).limit(1);
  return {
    autoSubmit: row?.disputeAutoSubmit ?? SHIP_DEFAULTS.disputeAutoSubmit,
    leadHours: row?.disputeSubmitLeadHours ?? SHIP_DEFAULTS.disputeSubmitLeadHours,
    feeBearer: row?.disputeFeeBearer ?? SHIP_DEFAULTS.disputeFeeBearer,
    amountBearer: row?.disputedAmountBearer ?? SHIP_DEFAULTS.disputedAmountBearer,
    fraudMax: row?.earlyFraudRefundMaxCents ?? SHIP_DEFAULTS.earlyFraudRefundMaxCents,
  };
}

export async function assemblePacket(orderId: string | null): Promise<EvidencePacket> {
  const empty: EvidencePacket = {
    customerName: "Customer",
    customerEmail: "",
    productDescription: "Class booking",
    sessionWhen: "not recorded",
    policyText: "Full refund until 24 hours before the start.",
    acceptedAt: null,
    acceptedIp: null,
    policyVersion: null,
    checkedIn: false,
    waiverSigned: null,
    messages: "",
    emailsSent: "",
    serviceNotes: "",
    priorBookings: "0",
    refundExplanation: "One charge for this booking.",
  };
  if (!orderId) return empty;
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) return empty;
  const [person] = order.userId ? await db.select().from(user).where(eq(user.id, order.userId)).limit(1) : [];
  const [booking] = await db.select().from(bookings).where(eq(bookings.orderId, order.id)).limit(1);
  const [klass] = booking ? await db.select().from(classes).where(eq(classes.id, booking.classId)).limit(1) : [];
  const [visit] = booking ? [] : await db.select().from(visitBookings).where(eq(visitBookings.orderId, order.id)).limit(1);
  const [service] = visit ? await db.select().from(services).where(eq(services.id, visit.serviceId)).limit(1) : [];
  const links = booking ? await db.select().from(bookingSessions).where(eq(bookingSessions.bookingId, booking.id)) : [];
  const sessionRows = links.length ? await db.select().from(sessions).where(eq(sessions.id, links[0]!.sessionId)) : [];
  const [acceptance] = await db.select().from(policyAcceptances).where(eq(policyAcceptances.orderId, order.id)).limit(1);
  const emailRows = order.teacherId && person?.email
    ? await db.select().from(emailOutbox).where(and(eq(emailOutbox.teacherId, order.teacherId), arrayContains(emailOutbox.toAddresses, [person.email]))).limit(5)
    : [];
  const history = order.userId ? await db.select().from(bookings).where(eq(bookings.userId, order.userId)) : [];
  const classIds = [...new Set(history.map((row) => row.classId))];
  const historyClasses = classIds.length ? await db.select().from(classes).where(inArray(classes.id, classIds)) : [];
  const waiverRows = order.userId && order.teacherId
    ? await db.select().from(waiverSignatures).where(and(eq(waiverSignatures.userId, order.userId), eq(waiverSignatures.teacherId, order.teacherId))).limit(5)
    : [];
  const scoped = scopedDisputeRecords({
    teacherId: order.teacherId ?? "",
    userId: order.userId ?? "",
    customerEmail: person?.email ?? "",
    emails: emailRows,
    waivers: waiverRows,
    bookings: history,
    classTeacherIds: new Map(historyClasses.map((row) => [row.id, row.teacherId])),
  });
  const emails = scoped.emails;
  const signature = scoped.waiver;
  const priorCount = scoped.priorBookings.length;
  return {
    customerName: person?.name || "Customer",
    customerEmail: person?.email || "",
    productDescription: klass ? `${klass.title}. ${klass.description}` : service ? `${service.title}. ${service.description}` : order.kind,
    sessionWhen: sessionRows[0]?.startsAt.toISOString() ?? visit?.startsAt.toISOString() ?? "not recorded",
    policyText: acceptance?.policyText || empty.policyText,
    acceptedAt: acceptance?.acceptedAt.toISOString() ?? null,
    acceptedIp: acceptance?.ip ?? null,
    policyVersion: acceptance?.policyVersion ?? null,
    checkedIn: links.some((link) => link.checkedIn),
    waiverSigned: signature ? `${signature.signedName} version ${signature.version} at ${signature.signedAt.toISOString()} from ${signature.ip ?? "unknown"}` : null,
    messages: emails.map((email) => email.subject).join("; "),
    emailsSent: emails.map((email) => email.subject).join("; "),
    serviceNotes: klass?.whatToBring || klass?.outcomes || "",
    priorBookings: String(priorCount),
    refundExplanation: `Order ${order.id} charged ${(order.studentPaysCents / 100).toFixed(2)} and has refunded ${(order.refundedCents / 100).toFixed(2)}.`,
  };
}

export async function recordDispute(input: { id: string; paymentIntentId?: string | null; amountCents: number; feeCents?: number; reason: string; status: string; dueBy?: Date | null }) {
  const policy = await settings();
  const [order] = input.paymentIntentId ? await db.select().from(orders).where(eq(orders.stripePaymentIntentId, input.paymentIntentId)).limit(1) : [];
  const packet = await assemblePacket(order?.id ?? null);
  const evidence = evidenceForReason(input.reason, packet);
  const summary = Object.entries(evidence).map(([key, value]) => `${key}: ${value}`).join("\n");
  const attendance = packet.checkedIn;
  const existing = await db.select().from(disputes).where(eq(disputes.id, input.id)).limit(1);
  const row = {
    orderId: order?.id,
    teacherId: order?.teacherId,
    userId: order?.userId,
    amountCents: input.amountCents,
    feeCents: input.feeCents ?? 1500,
    reason: input.reason || "general",
    status: input.status,
    dueBy: input.dueBy,
    attendanceConfirmed: attendance,
    amountBearer: policy.amountBearer,
    feeBearer: policy.feeBearer,
    paymentIntentId: input.paymentIntentId,
    summary,
    evidence,
    updatedAt: new Date(),
  };
  const due = input.dueBy ?? existing[0]?.dueBy ?? null;
  const confirmed = Boolean(existing[0]?.attendanceConfirmed) || attendance;
  const runAt = confirmed || !due ? new Date() : new Date(due.getTime() - policy.leadHours * 3_600_000);
  if (existing[0]) {
    const merged = disputeUpdateFromStripe(existing[0], row);
    const checkedIn = refreshCheckedInEvidence({
      summary: merged.summary,
      evidence: merged.evidence,
      incomingEvidence: row.evidence,
      attendanceConfirmed: attendance,
    });
    await db.update(disputes).set({ ...merged, summary: checkedIn.summary, evidence: checkedIn.evidence }).where(eq(disputes.id, input.id));
    if (existing[0].evidenceStatus !== "submitted" && existing[0].evidenceStatus !== "held" && disputeAcceptsEvidence(input.status)) {
      await ensureQueuedJob("dispute.submit", { disputeId: input.id }, runAt, `dispute-submit:${input.id}`);
    }
  } else {
    await db.insert(disputes).values({ id: input.id, evidenceStatus: "assembling", ...row });
    if (order?.teacherId) {
      const [teacher] = await db.select().from(teachers).where(eq(teachers.id, order.teacherId)).limit(1);
      if (teacher) {
        await emitNotification({
          userId: teacher.userId,
          event: "dispute.opened",
          audience: "teacher",
          title: "A card dispute was opened",
          body: `${packet.customerName} disputed ${(input.amountCents / 100).toFixed(2)}. You can add notes from Disputes.`,
          href: "/teach/disputes",
        });
      }
    }
    if (disputeAcceptsEvidence(input.status)) {
      await ensureQueuedJob("dispute.submit", { disputeId: input.id }, runAt, `dispute-submit:${input.id}`);
    }
  }
  return { id: input.id, evidence };
}

type SubmitResult = { ok: boolean; replayed?: boolean; skipped?: boolean; waiting?: boolean; retry?: boolean; error?: string; runAt?: Date };

export async function submitDispute(disputeId: string, actorUserId?: string | null): Promise<SubmitResult> {
  const [row] = await db.select().from(disputes).where(eq(disputes.id, disputeId)).limit(1);
  if (!row || row.evidenceStatus === "submitted") return { ok: true, replayed: true };
  if (!disputeAcceptsEvidence(row.status)) return { ok: true, skipped: true };
  const policy = await settings();
  const now = new Date();
  if (!actorUserId && (row.evidenceStatus === "held" || !policy.autoSubmit)) return { ok: true, skipped: true };
  const ready = shouldAutoSubmit({
    autoSubmit: policy.autoSubmit || Boolean(actorUserId),
    held: false,
    attendanceConfirmed: row.attendanceConfirmed,
    dueBy: row.dueBy,
    now,
    leadHours: policy.leadHours,
  });
  if (!ready && !actorUserId) {
    return { ok: true, waiting: true, runAt: nextDisputeSubmitAt({ dueBy: row.dueBy, leadHours: policy.leadHours, now, retry: false }) };
  }
  const notes = await db.select().from(disputeNotes).where(eq(disputeNotes.disputeId, row.id));
  const packet = withTeacherNotes(row.summary, row.evidence ?? {}, notes.map((note) => note.body));
  const pdf = textPdf(`Dispute ${row.id}`, packet.summary);
  const stripe = getStripe();
  if (!stripe) {
    return {
      ok: false,
      retry: !actorUserId,
      error: "Stripe is not configured",
      runAt: nextDisputeSubmitAt({ dueBy: row.dueBy, leadHours: policy.leadHours, now, retry: true }),
    };
  }
  const file = await stripe.files.create({
    purpose: "dispute_evidence",
    file: { data: pdf, name: `${row.id}.pdf`, type: "application/pdf" },
  });
  await stripe.disputes.update(row.id, { evidence: { ...packet.evidence, uncategorized_file: file.id }, submit: true });
  await db.update(disputes).set({ evidenceStatus: "submitted", stripeFileId: file.id, updatedAt: new Date() }).where(eq(disputes.id, row.id));
  await db.insert(auditLog).values({ id: crypto.randomUUID(), actorUserId: actorUserId ?? null, action: "dispute.submit", entityType: "dispute", entityId: row.id, summary: row.reason });
  return { ok: true };
}

export async function holdDispute(disputeId: string, actorUserId: string) {
  await db.update(disputes).set({ evidenceStatus: "held", updatedAt: new Date() }).where(eq(disputes.id, disputeId));
  await db.insert(auditLog).values({ id: crypto.randomUUID(), actorUserId, action: "dispute.hold", entityType: "dispute", entityId: disputeId, summary: "Held for review" });
}

export async function editDisputeSummary(disputeId: string, summary: string, actorUserId: string) {
  await db.update(disputes).set({ summary, updatedAt: new Date() }).where(eq(disputes.id, disputeId));
  await db.insert(auditLog).values({ id: crypto.randomUUID(), actorUserId, action: "dispute.edit", entityType: "dispute", entityId: disputeId, summary: "Evidence summary edited" });
}

export async function overrideLiability(disputeId: string, amountBearer: string, feeBearer: string, actorUserId: string) {
  await db.update(disputes).set({ amountBearer, feeBearer, updatedAt: new Date() }).where(eq(disputes.id, disputeId));
  await db.insert(auditLog).values({ id: crypto.randomUUID(), actorUserId, action: "dispute.liability", entityType: "dispute", entityId: disputeId, summary: `${amountBearer} / ${feeBearer}` });
}

export async function addDisputeNote(disputeId: string, authorUserId: string, body: string) {
  await db.insert(disputeNotes).values({ id: crypto.randomUUID(), disputeId, authorUserId, body });
}

export async function handleEarlyFraud(input: { chargeId: string; paymentIntentId?: string | null; amountCents: number }) {
  const policy = await settings();
  const [order] = input.paymentIntentId ? await db.select().from(orders).where(eq(orders.stripePaymentIntentId, input.paymentIntentId)).limit(1) : [];
  let classStarted = false;
  if (order) {
    const [booking] = await db.select().from(bookings).where(eq(bookings.orderId, order.id)).limit(1);
    const links = booking ? await db.select().from(bookingSessions).where(eq(bookingSessions.bookingId, booking.id)) : [];
    const sessionRows = links.length ? await db.select().from(sessions).where(inArray(sessions.id, links.map((link) => link.sessionId))) : [];
    classStarted = classHasStarted(sessionRows.map((session) => session.startsAt), new Date());
  }
  if (order && !classStarted) {
    const [visit] = await db.select().from(visitBookings).where(eq(visitBookings.orderId, order.id)).limit(1);
    if (visit) classStarted = classHasStarted([visit.startsAt], new Date());
  }
  const decision = earlyFraudDecision({ amountCents: input.amountCents, classStarted, thresholdCents: policy.fraudMax });
  if (decision === "refund" && order) {
    await issueRefund({ orderId: order.id, reasonCode: "early_fraud", actorUserId: null, scope: input.chargeId });
    return { decision };
  }
  await db.insert(auditLog).values({ id: crypto.randomUUID(), action: "fraud.flag", entityType: "charge", entityId: input.chargeId, summary: `Early fraud warning flagged at ${(input.amountCents / 100).toFixed(2)}` });
  return { decision };
}

export function liabilityFor(row: { amountCents: number; feeCents: number; amountBearer: string; feeBearer: string }) {
  return disputeLiability(row);
}
