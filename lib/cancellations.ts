import { and, eq, inArray, ne } from "drizzle-orm";
import { resolvedPolicy, studentCancelOutcome, teacherRefundChoice, lateCancelFee } from "@/lib/cancel-policy";
import { seriesCancelError, sessionBelongsToClass } from "@/lib/checkout-rules";
import { db } from "@/lib/db";
import { bookingSessions, bookings, classes, creditLedger, introRedemptions, membershipSubscriptions, orders, packPurchases, platformSettings, refundLedger, services, sessions, teacherPolicies, teachers, user, visitBookings } from "@/lib/db/schema";
import { emitNotification } from "@/lib/notifications";
import { shouldRestoreEntitlement } from "@/lib/pricing";
import { entitlementRestoreKey, introRestoresWhenBookingCloses, packCreditsToRestore, refundFailureKeepsSeat, refundLedgerMatchesSession, teacherCancelRetriesRefundOnly, teacherRefundStillOpen } from "@/lib/refund-math";
import { consumeRefundableCash, grantStudioCredit, issueRefund, restorePackCredits } from "@/lib/refunds";
import { releaseVisitSeat, restoreStudioCreditForOrder } from "@/lib/booking-service";

async function policyForTeacher(teacherId: string) {
  const [platform] = await db.select().from(platformSettings).limit(1);
  const [override] = await db.select().from(teacherPolicies).where(eq(teacherPolicies.teacherId, teacherId)).limit(1);
  return {
    creditRequiresStudentOptIn: platform?.creditRequiresOptIn ?? true,
    version: platform?.policyVersion ?? 1,
    ...resolvedPolicy(
      {
        fullRefundHours: platform?.studentFullRefundHours ?? 24,
        creditOnlyHours: platform?.studentCreditOnlyHours ?? 2,
        lateCancelFeeCents: platform?.lateCancelFeeCents ?? 0,
        noShowFeeCents: platform?.noShowFeeCents ?? 0,
      },
      override ?? null,
    ),
  };
}

export async function teacherCancelSession(input: { sessionId: string; classId?: string; actorUserId: string; reason?: string; wantCredit?: boolean }) {
  const [session] = await db.select().from(sessions).where(eq(sessions.id, input.sessionId)).limit(1);
  if (!session) return { error: "Session not found." };
  if (input.classId && !sessionBelongsToClass(session.classId, input.classId)) return { error: "That date is not part of this class." };
  const [klass] = await db.select().from(classes).where(eq(classes.id, session.classId)).limit(1);
  if (!klass) return { error: "Class not found." };
  if (teacherCancelRetriesRefundOnly(session.status)) return retryOpenTeacherRefunds(session.id, input.actorUserId);
  const claimed = await db
    .update(sessions)
    .set({ status: "cancelled", exception: "skipped", cancellationReason: input.reason || "Teacher cancelled this date" })
    .where(and(eq(sessions.id, session.id), ne(sessions.status, "cancelled")))
    .returning();
  if (!claimed.length) return retryOpenTeacherRefunds(session.id, input.actorUserId);
  const links = await db.select().from(bookingSessions).where(eq(bookingSessions.sessionId, session.id));
  const bookingIds = links.map((link) => link.bookingId);
  const bookingRows = bookingIds.length ? await db.select().from(bookings).where(inArray(bookings.id, bookingIds)) : [];
  const policy = await policyForTeacher(klass.teacherId);
  let refunded = 0;
  const refundErrors: string[] = [];
  for (const booking of bookingRows.filter((row) => row.status === "confirmed")) {
    const mates = await db.select().from(bookingSessions).where(eq(bookingSessions.bookingId, booking.id));
    const [order] = booking.orderId ? await db.select().from(orders).where(eq(orders.id, booking.orderId)).limit(1) : [];
    const [person] = booking.userId ? await db.select().from(user).where(eq(user.id, booking.userId)).limit(1) : [];
    const choice = teacherRefundChoice({
      studentOptedIntoCredit: Boolean(person?.creditOptIn),
      teacherWantsCredit: Boolean(input.wantCredit),
      creditRequiresStudentOptIn: policy.creditRequiresStudentOptIn,
    });
    const sessionCount = Math.max(1, mates.length);
    let refundError: string | null = null;
    if (order && choice === "full_refund") {
      const result = await issueRefund({ orderId: order.id, sessionCount, cancelledCount: 1, reasonCode: "teacher_cancel", actorUserId: input.actorUserId, scope: session.id });
      if ("error" in result && result.error) {
        if (refundFailureKeepsSeat(result.error)) refundError = result.error;
      } else if ("amountCents" in result) refunded += result.amountCents ?? 0;
    } else if (order && person && choice === "credit") {
      const share = Math.min(Math.max(0, order.studentPaysCents - order.refundedCents), Math.round(order.studentPaysCents / sessionCount));
      const applied = await consumeRefundableCash(order.id, share);
      if (applied > 0) await grantStudioCredit(person.id, klass.teacherId, applied);
    }
    const remainingDates = mates.filter((mate) => mate.sessionId !== session.id);
    const closesBooking = remainingDates.length === 0 || booking.kind === "session";
    if (order) {
      await restoreStudioCreditForOrder(order.id, {
        scope: closesBooking ? `booking-${booking.id}` : `session-${session.id}`,
        sessionCount,
        cancelledCount: 1,
        closeRemainder: closesBooking,
      });
    }
    let restoredEntitlement = false;
    if (booking.packPurchaseId) {
      const [purchase] = await db.select().from(packPurchases).where(eq(packPurchases.id, booking.packPurchaseId)).limit(1);
      const consumed = purchase ? Math.max(0, purchase.creditsTotal - purchase.creditsRemaining) : 0;
      const restore = packCreditsToRestore({ creditsConsumed: consumed, cancelledSessions: 1, sessionCount });
      if (restore > 0) {
        await restorePackCredits(booking.packPurchaseId, restore);
        restoredEntitlement = true;
      }
    }
    if (booking.membershipSubscriptionId) {
      const [sub] = await db.select().from(membershipSubscriptions).where(eq(membershipSubscriptions.id, booking.membershipSubscriptionId)).limit(1);
      if (sub) {
        await db.update(membershipSubscriptions).set({ classesUsedThisPeriod: Math.max(0, sub.classesUsedThisPeriod - 1) }).where(eq(membershipSubscriptions.id, sub.id));
        restoredEntitlement = true;
      }
    }
    if (restoredEntitlement && booking.userId) {
      await db.insert(creditLedger).values({
        id: crypto.randomUUID(),
        userId: booking.userId,
        teacherId: klass.teacherId,
        bookingId: booking.id,
        sourceType: booking.packPurchaseId ? "pack" : "membership",
        sourceId: entitlementRestoreKey(booking.id, session.id),
        direction: "restore",
      });
    }
    if (closesBooking) {
      const closed = await db.update(bookings).set({ status: "cancelled", cancelledAt: new Date() }).where(and(eq(bookings.id, booking.id), eq(bookings.status, "confirmed"))).returning({ id: bookings.id });
      if (closed.length) {
        const ids = mates.map((mate) => mate.sessionId);
        const dated = ids.length ? await db.select({ startsAt: sessions.startsAt }).from(sessions).where(inArray(sessions.id, ids)) : [];
        const now = new Date();
        if (introRestoresWhenBookingCloses({
          closesBooking: true,
          everySessionStillAhead: dated.length > 0 && dated.every((row) => shouldRestoreEntitlement(row.startsAt, now)),
        })) {
          await db.update(introRedemptions).set({ restored: true }).where(and(eq(introRedemptions.bookingId, booking.id), eq(introRedemptions.restored, false)));
        }
      }
    }
    if (refundError) refundErrors.push(refundError);
    if (person) {
      await emitNotification({
        userId: person.id,
        event: "booking.cancelled",
        audience: "student",
        title: `${klass.title} was cancelled`,
        body: refundError
          ? "Your teacher cancelled this date. The card refund did not go through and can be retried."
          : input.reason || "Your teacher cancelled this date. A refund or studio credit follows the cancellation policy.",
        href: `/c/${klass.slug}`,
      });
    }
  }
  const [teacher] = await db.select().from(teachers).where(eq(teachers.id, klass.teacherId)).limit(1);
  if (teacher) {
    await emitNotification({
      userId: teacher.userId,
      event: "booking.cancelled",
      audience: "teacher",
      title: `You cancelled ${klass.title}`,
      body: `${bookingRows.length} bookings updated.`,
      href: `/teach/sessions/${session.id}`,
    });
  }
  if (refundErrors.length) return { error: refundErrors[0], refundedCents: refunded };
  return { ok: true, refundedCents: refunded };
}

/** The date stays cancelled. This only resubmits card refunds that never posted. */
async function retryOpenTeacherRefunds(sessionId: string, actorUserId: string) {
  const links = await db.select().from(bookingSessions).where(eq(bookingSessions.sessionId, sessionId));
  const bookingIds = links.map((link) => link.bookingId);
  const bookingRows = bookingIds.length ? await db.select().from(bookings).where(inArray(bookings.id, bookingIds)) : [];
  let refunded = 0;
  const refundErrors: string[] = [];
  let retried = false;
  for (const booking of bookingRows) {
    if (!booking.orderId) continue;
    const ledgers = await db.select().from(refundLedger).where(and(eq(refundLedger.orderId, booking.orderId), eq(refundLedger.reasonCode, "teacher_cancel")));
    const open = ledgers.filter((row) => refundLedgerMatchesSession(row.idempotencyKey, sessionId) && teacherRefundStillOpen(row.status));
    if (!open.length) continue;
    retried = true;
    const mates = await db.select().from(bookingSessions).where(eq(bookingSessions.bookingId, booking.id));
    const result = await issueRefund({
      orderId: booking.orderId,
      sessionCount: Math.max(1, mates.length),
      cancelledCount: 1,
      reasonCode: "teacher_cancel",
      actorUserId,
      scope: sessionId,
    });
    if ("error" in result && result.error) {
      if (refundFailureKeepsSeat(result.error)) refundErrors.push(result.error);
    } else if ("amountCents" in result) refunded += result.amountCents ?? 0;
  }
  if (!retried) return { ok: true as const, replayed: true, refundedCents: 0 };
  if (refundErrors.length) return { error: refundErrors[0], refundedCents: refunded, replayed: true };
  return { ok: true as const, replayed: true, refundedCents: refunded };
}

export async function teacherCancelUpcoming(input: { classId: string; actorUserId: string; reason?: string; wantCredit?: boolean }) {
  const upcoming = await db.select().from(sessions).where(and(eq(sessions.classId, input.classId), eq(sessions.status, "scheduled")));
  const future = upcoming.filter((session) => session.startsAt > new Date());
  const errors: (string | undefined)[] = [];
  for (const session of future) {
    const result = await teacherCancelSession({ sessionId: session.id, classId: input.classId, actorUserId: input.actorUserId, reason: input.reason, wantCredit: input.wantCredit });
    if ("error" in result) errors.push(result.error);
  }
  const error = seriesCancelError(errors);
  if (error) return { error, count: future.length };
  return { ok: true, count: future.length };
}

export async function studentCancelVisit(userId: string, visitId: string) {
  const now = new Date();
  const [visit] = await db.select().from(visitBookings).where(and(eq(visitBookings.id, visitId), eq(visitBookings.userId, userId))).limit(1);
  if (!visit || visit.status !== "confirmed") return { error: "Booking not found." };
  if (visit.startsAt <= now) return { error: "This visit has already started." };
  const [service] = await db.select().from(services).where(eq(services.id, visit.serviceId)).limit(1);
  if (!service) return { error: "Booking not found." };
  const policy = await policyForTeacher(service.teacherId);
  const outcome = studentCancelOutcome({
    now,
    startsAt: visit.startsAt,
    fullRefundHours: policy.fullRefundHours,
    creditOnlyHours: policy.creditOnlyHours,
  });
  const fee = lateCancelFee({ outcome, lateCancelFeeCents: policy.lateCancelFeeCents });
  if (visit.orderId && outcome === "full_refund") {
    const result = await issueRefund({ orderId: visit.orderId, reasonCode: "student_cancel", actorUserId: userId, scope: visit.id });
    if ("error" in result && refundFailureKeepsSeat(result.error)) return { error: result.error };
  }
  await releaseVisitSeat(visit, now);
  if (visit.orderId && (outcome === "full_refund" || outcome === "credit")) {
    await restoreStudioCreditForOrder(visit.orderId, { scope: `visit-${visit.id}`, sessionCount: 1, cancelledCount: 1, closeRemainder: true });
  }
  if (visit.orderId && outcome === "credit") {
    const [order] = await db.select().from(orders).where(eq(orders.id, visit.orderId)).limit(1);
    if (order) {
      const applied = await consumeRefundableCash(order.id, Math.max(0, order.studentPaysCents - order.refundedCents));
      if (applied > 0) await grantStudioCredit(userId, service.teacherId, applied);
    }
  }
  await emitNotification({
    userId,
    event: outcome === "full_refund" ? "booking.refunded" : "booking.cancelled",
    audience: "student",
    title: `${service.title} cancelled`,
    body: outcome === "full_refund" ? "A full refund is on the way." : outcome === "credit" ? "Studio credit was added." : fee ? `No refund. A late cancel fee of $${(fee / 100).toFixed(2)} may apply.` : "This cancellation is outside the refund window.",
    href: "/bookings",
  });
  return { ok: true, outcome, feeCents: fee };
}

export async function teacherCancelVisit(input: { visitId: string; actorUserId: string; reason?: string; wantCredit?: boolean }) {
  const [visit] = await db.select().from(visitBookings).where(eq(visitBookings.id, input.visitId)).limit(1);
  if (!visit || visit.status !== "confirmed") return { error: "Booking not found." };
  const [service] = await db.select().from(services).where(eq(services.id, visit.serviceId)).limit(1);
  if (!service) return { error: "Offering not found." };
  const policy = await policyForTeacher(service.teacherId);
  const [person] = visit.userId ? await db.select().from(user).where(eq(user.id, visit.userId)).limit(1) : [];
  const choice = teacherRefundChoice({
    studentOptedIntoCredit: Boolean(person?.creditOptIn),
    teacherWantsCredit: Boolean(input.wantCredit),
    creditRequiresStudentOptIn: policy.creditRequiresStudentOptIn,
  });
  if (visit.orderId && choice === "full_refund") {
    const result = await issueRefund({ orderId: visit.orderId, reasonCode: "teacher_cancel", actorUserId: input.actorUserId, scope: visit.id });
    if ("error" in result && refundFailureKeepsSeat(result.error)) return { error: result.error };
  }
  await releaseVisitSeat(visit, new Date());
  if (visit.orderId) await restoreStudioCreditForOrder(visit.orderId, { scope: `visit-${visit.id}`, sessionCount: 1, cancelledCount: 1, closeRemainder: true });
  if (visit.orderId && person && choice === "credit") {
    const [order] = await db.select().from(orders).where(eq(orders.id, visit.orderId)).limit(1);
    if (order) {
      const applied = await consumeRefundableCash(order.id, Math.max(0, order.studentPaysCents - order.refundedCents));
      if (applied > 0) await grantStudioCredit(person.id, service.teacherId, applied);
    }
  }
  if (person) {
    await emitNotification({
      userId: person.id,
      event: "booking.cancelled",
      audience: "student",
      title: `${service.title} was cancelled`,
      body: input.reason || "Your practitioner cancelled this appointment. A refund follows unless you opted into studio credit.",
      href: `/s/${service.slug}`,
    });
  }
  return { ok: true };
}

export { lateCancelFee, policyForTeacher };
