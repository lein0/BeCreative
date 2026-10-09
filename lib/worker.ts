import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookingSessions, bookings, classes, sessions, teachers } from "@/lib/db/schema";
import { DISPUTE_SUBMIT_ATTEMPTS } from "@/lib/dispute-evidence";
import { claimJobs, enqueueJob, finishJob, requeueJob } from "@/lib/jobs";
import { deliverOutbox, emitNotification } from "@/lib/notifications";
import { captureException } from "@/lib/sentry";

export async function workJobs(limit = 20) {
  const claimed = await claimJobs(limit);
  let done = 0;
  for (const job of claimed) {
    try {
      const payload = (job.payload ?? {}) as Record<string, unknown>;
      if (job.kind === "notification.deliver" || job.kind === "notification.sms") {
        const audience = payload.audience === "teacher" || payload.audience === "student" ? payload.audience : undefined;
        await deliverOutbox(String(payload.outboxId ?? ""), typeof payload.phone === "string" ? payload.phone : null, audience, {
          textEligible: payload.textEligible === true,
          smsOnly: job.kind === "notification.sms",
        });
      }
      if (job.kind === "dispute.submit") {
        const { submitDispute } = await import("@/lib/disputes");
        const result = await submitDispute(String(payload.disputeId ?? ""));
        if (result.waiting) {
          await requeueJob(job.id, result.runAt ?? new Date(Date.now() + 60 * 60 * 1000));
          continue;
        }
        if (result.retry) {
          if (job.attempts >= DISPUTE_SUBMIT_ATTEMPTS) await finishJob(job.id, result.error ?? "Dispute submit failed");
          else await requeueJob(job.id, result.runAt ?? new Date(Date.now() + 15 * 60 * 1000), result.error);
          continue;
        }
      }
      if (job.kind === "reminder.send" || job.kind === "lifecycle.notify") {
        await emitNotification({
          userId: String(payload.userId),
          event: (payload.event as "booking.reminder") || "booking.reminder",
          audience: payload.audience === "teacher" ? "teacher" : "student",
          title: String(payload.title ?? "Class reminder"),
          body: String(payload.body ?? ""),
          href: String(payload.href ?? "/bookings"),
          textEligible: payload.textEligible === true,
        });
      }
      await finishJob(job.id);
      done += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Job failed";
      if (job.kind === "dispute.submit") {
        try {
          await captureException(error, { job: job.id, kind: job.kind });
        } catch {
          /* monitoring must not block the worker */
        }
      }
      if (job.kind === "dispute.submit" && job.attempts < DISPUTE_SUBMIT_ATTEMPTS) {
        const delay = Math.min(6 * 3_600_000, 15 * 60 * 1000 * 2 ** Math.max(0, job.attempts - 1));
        await requeueJob(job.id, new Date(Date.now() + delay), message);
      } else {
        await finishJob(job.id, message);
      }
    }
  }
  return { claimed: claimed.length, done };
}

export async function scheduleReminders(now = new Date()) {
  const windows = [
    { hours: 24, label: "24 hours" },
    { hours: 2, label: "2 hours" },
  ];
  let queued = 0;
  for (const window of windows) {
    const from = new Date(now.getTime() + (window.hours - 0.5) * 3_600_000);
    const to = new Date(now.getTime() + (window.hours + 0.5) * 3_600_000);
    const rows = await db.select().from(sessions).where(and(eq(sessions.status, "scheduled"), gte(sessions.startsAt, from), lte(sessions.startsAt, to)));
    for (const session of rows) {
      const links = await db.select().from(bookingSessions).where(eq(bookingSessions.sessionId, session.id));
      const ids = links.map((link) => link.bookingId);
      if (!ids.length) continue;
      const mine = await db.select().from(bookings).where(and(inArray(bookings.id, ids), eq(bookings.status, "confirmed")));
      const [klass] = await db.select().from(classes).where(eq(classes.id, session.classId)).limit(1);
      for (const booking of mine) {
        if (!booking.userId) continue;
        await enqueueJob("reminder.send", {
          userId: booking.userId,
          event: "booking.reminder",
          audience: "student",
          title: `${klass?.title ?? "Your class"} is in ${window.label}`,
          body: `It starts ${session.startsAt.toISOString()}.`,
          href: klass ? `/c/${klass.slug}` : "/bookings",
          textEligible: window.hours === 2,
        }, new Date(), `reminder:${session.id}:${booking.userId}:${window.hours}`);
        queued += 1;
      }
    }
  }
  return { queued };
}

export async function notifyTeacherOfBooking(input: { teacherUserId: string; studentName: string; title: string; href: string }) {
  await emitNotification({
    userId: input.teacherUserId,
    event: "booking.created",
    audience: "teacher",
    title: `New booking: ${input.title}`,
    body: `${input.studentName} booked ${input.title}.`,
    href: input.href,
  });
  const [teacher] = await db.select().from(teachers).where(eq(teachers.userId, input.teacherUserId)).limit(1);
  if (!teacher) return;
  const [count] = await db.select({ total: sql<number>`count(*)::int` }).from(bookings).innerJoin(classes, eq(classes.id, bookings.classId)).where(eq(classes.teacherId, teacher.id));
  if (Number(count?.total ?? 0) === 1) {
    await emitNotification({
      userId: input.teacherUserId,
      event: "teacher.first_booking",
      audience: "teacher",
      title: input.title,
      body: `${input.studentName} took the first seat.`,
      href: input.href,
    });
    const { capture } = await import("@/lib/analytics");
    await capture({ name: "first_booking_received", userId: input.teacherUserId, properties: { title: input.title } });
  }
}

export async function notifyOfferPurchased(input: { teacherUserId: string; title: string; href: string }) {
  await emitNotification({
    userId: input.teacherUserId,
    event: "offer.purchased",
    audience: "teacher",
    title: `Purchase: ${input.title}`,
    body: `A student bought ${input.title}.`,
    href: input.href,
  });
}

export async function notifyStudentConfirmed(input: { userId: string; title: string; href: string }) {
  await emitNotification({
    userId: input.userId,
    event: "booking.confirmed",
    audience: "student",
    title: `You're booked: ${input.title}`,
    body: "Your seat is reserved. A receipt is in this note.",
    href: input.href,
  });
  await emitNotification({
    userId: input.userId,
    event: "receipt.sent",
    audience: "student",
    title: `Receipt for ${input.title}`,
    body: "This confirms the amount and the cancellation policy you accepted.",
    href: input.href,
  });
}

