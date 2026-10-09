import { and, eq, inArray, ne } from "drizzle-orm";
import { resolvedPolicy, studentCancelOutcome, teacherRefundChoice, lateCancelFee } from "@/lib/cancel-policy";
import { sessionBelongsToClass, sessionCancelAlreadyApplied } from "@/lib/checkout-rules";
import { db } from "@/lib/db";
import { bookingSessions, bookings, classes, membershipSubscriptions, orders, packPurchases, platformSettings, services, sessions, teacherPolicies, teachers, user, visitBookings } from "@/lib/db/schema";
import { sameLocalDay } from "@/lib/messaging-rules";
import { emitNotification } from "@/lib/notifications";
import { packCreditsToRestore } from "@/lib/refund-math";
import { grantStudioCredit, issueRefund, restorePackCredits } from "@/lib/refunds";
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
  if (sessionCancelAlreadyApplied(session.status)) return { ok: true, replayed: true, refundedCents: 0 };
  const claimed = await db
    .update(sessions)
    .set({ status: "cancelled", exception: "skipped", cancellationReason: input.reason || "Teacher cancelled this date" })
    .where(and(eq(sessions.id, session.id), ne(sessions.status, "cancelled")))
    .returning();
  if (!claimed.length) return { ok: true, replayed: true, refundedCents: 0 };
  const links = await db.select().from(bookingSessions).where(eq(bookingSessions.sessionId, session.id));
  const bookingIds = links.map((link) => link.bookingId);
  const bookingRows = bookingIds.length ? await db.select().from(bookings).where(inArray(bookings.id, bookingIds)) : [];
  const policy = await policyForTeacher(klass.teacherId);
  let refunded = 0;
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
    if (order && choice === "full_refund") {
      const result = await issueRefund({ orderId: order.id, sessionCount, cancelledCount: 1, reasonCode: "teacher_cancel", actorUserId: input.actorUserId, scope: session.id });
      if ("amountCents" in result) refunded += result.amountCents ?? 0;
    } else if (order && person && choice === "credit") {
      const share = Math.round(order.studentPaysCents / sessionCount);
      await grantStudioCredit(person.id, klass.teacherId, share);
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
    if (booking.packPurchaseId) {
      const [purchase] = await db.select().from(packPurchases).where(eq(packPurchases.id, booking.packPurchaseId)).limit(1);
      const consumed = purchase ? Math.max(0, purchase.creditsTotal - purchase.creditsRemaining) : 0;
      const restore = packCreditsToRestore({ creditsConsumed: consumed, cancelledSessions: 1, sessionCount });
      if (restore > 0) await restorePackCredits(booking.packPurchaseId, restore);
    }
    if (booking.membershipSubscriptionId) {
      const [sub] = await db.select().from(membershipSubscriptions).where(eq(membershipSubscriptions.id, booking.membershipSubscriptionId)).limit(1);
      if (sub) await db.update(membershipSubscriptions).set({ classesUsedThisPeriod: Math.max(0, sub.classesUsedThisPeriod - 1) }).where(eq(membershipSubscriptions.id, sub.id));
    }
    if (closesBooking) {
      await db.update(bookings).set({ status: "cancelled", cancelledAt: new Date() }).where(and(eq(bookings.id, booking.id), eq(bookings.status, "confirmed")));
    }
    if (person) {
      await emitNotification({
        userId: person.id,
        event: "booking.cancelled",
        audience: "student",
        title: `${klass.title} was cancelled`,
        body: input.reason || "Your teacher cancelled this date. A refund or studio credit follows the cancellation policy.",
        href: `/c/${klass.slug}`,
        textEligible: sameLocalDay(session.startsAt, new Date()),
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
  return { ok: true, refundedCents: refunded };
}

export async function teacherCancelUpcoming(input: { classId: string; actorUserId: string; reason?: string; wantCredit?: boolean }) {
  const upcoming = await db.select().from(sessions).where(and(eq(sessions.classId, input.classId), eq(sessions.status, "scheduled")));
  const future = upcoming.filter((session) => session.startsAt > new Date());
  for (const session of future) {
    await teacherCancelSession({ sessionId: session.id, classId: input.classId, actorUserId: input.actorUserId, reason: input.reason, wantCredit: input.wantCredit });
  }
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
  await releaseVisitSeat(visit, now);
  if (visit.orderId && (outcome === "full_refund" || outcome === "credit")) {
    await restoreStudioCreditForOrder(visit.orderId, { scope: `visit-${visit.id}`, sessionCount: 1, cancelledCount: 1, closeRemainder: true });
  }
  if (visit.orderId && outcome === "full_refund") await issueRefund({ orderId: visit.orderId, reasonCode: "student_cancel", actorUserId: userId, scope: visit.id });
  else if (visit.orderId && outcome === "credit") {
    const [order] = await db.select().from(orders).where(eq(orders.id, visit.orderId)).limit(1);
    if (order) await grantStudioCredit(userId, service.teacherId, Math.max(0, order.studentPaysCents - order.refundedCents));
  }
  await emitNotification({
    userId,
    event: outcome === "full_refund" ? "booking.refunded" : "booking.cancelled",
    audience: "student",
    title: `${service.title} cancelled`,
    body: outcome === "full_refund" ? "A full refund is on the way." : outcome === "credit" ? "Studio credit was added." : fee ? `No refund. A late cancel fee of $${(fee / 100).toFixed(2)} may apply.` : "This cancellation is outside the refund window.",
    href: "/bookings",
    textEligible: outcome !== "full_refund" && sameLocalDay(visit.startsAt, now),
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
  await releaseVisitSeat(visit, new Date());
  if (visit.orderId) await restoreStudioCreditForOrder(visit.orderId, { scope: `visit-${visit.id}`, sessionCount: 1, cancelledCount: 1, closeRemainder: true });
  if (visit.orderId && choice === "full_refund") await issueRefund({ orderId: visit.orderId, reasonCode: "teacher_cancel", actorUserId: input.actorUserId, scope: visit.id });
  else if (visit.orderId && person && choice === "credit") {
    const [order] = await db.select().from(orders).where(eq(orders.id, visit.orderId)).limit(1);
    if (order) await grantStudioCredit(person.id, service.teacherId, order.studentPaysCents);
  }
  if (person) {
    await emitNotification({
      userId: person.id,
      event: "booking.cancelled",
      audience: "student",
      title: `${service.title} was cancelled`,
      body: input.reason || "Your practitioner cancelled this appointment. A refund follows unless you opted into studio credit.",
      href: `/s/${service.slug}`,
      textEligible: sameLocalDay(visit.startsAt, new Date()),
    });
  }
  return { ok: true };
}

export { lateCancelFee, policyForTeacher };
