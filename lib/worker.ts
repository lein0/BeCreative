import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookingSessions, bookings, classes, services, sessions, visitBookings } from "@/lib/db/schema";
import { claimJobs, enqueueJob, finishJob } from "@/lib/jobs";
import { deliverOutbox, emitNotification } from "@/lib/notifications";

export async function workJobs(limit = 20) {
  const claimed = await claimJobs(limit);
  let done = 0;
  for (const job of claimed) {
    try {
      const payload = (job.payload ?? {}) as Record<string, unknown>;
      if (job.kind === "notification.deliver" || job.kind === "notification.sms") {
        const audience = payload.audience === "teacher" || payload.audience === "student" ? payload.audience : undefined;
        await deliverOutbox(String(payload.outboxId ?? ""), typeof payload.phone === "string" ? payload.phone : null, audience, job.kind === "notification.sms" ? "sms" : "all");
      }
      if (job.kind === "reminder.send") {
        await emitNotification({
          userId: String(payload.userId),
          event: "booking.reminder",
          audience: "student",
          title: String(payload.title ?? "Class reminder"),
          body: String(payload.body ?? ""),
          href: String(payload.href ?? "/bookings"),
        });
      }
      await finishJob(job.id);
      done += 1;
    } catch (error) {
      await finishJob(job.id, error instanceof Error ? error.message : "Job failed");
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
          title: `${klass?.title ?? "Your class"} is in ${window.label}`,
          body: `It starts ${session.startsAt.toISOString()}.`,
          href: klass ? `/c/${klass.slug}` : "/bookings",
        }, new Date(), `reminder:${session.id}:${booking.userId}:${window.hours}`);
        queued += 1;
      }
    }
    const visits = await db
      .select()
      .from(visitBookings)
      .where(and(eq(visitBookings.status, "confirmed"), gte(visitBookings.startsAt, from), lte(visitBookings.startsAt, to)));
    for (const visit of visits) {
      if (!visit.userId) continue;
      const [service] = await db.select().from(services).where(eq(services.id, visit.serviceId)).limit(1);
      await enqueueJob("reminder.send", {
        userId: visit.userId,
        title: `${service?.title ?? "Your visit"} is in ${window.label}`,
        body: `It starts ${visit.startsAt.toISOString()}.`,
        href: service ? `/s/${service.slug}` : "/bookings",
      }, new Date(), `reminder:visit:${visit.id}:${visit.userId}:${window.hours}`);
      queued += 1;
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

