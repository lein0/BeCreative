import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  auditLog,
  bookingSessions,
  bookings,
  classMedia,
  classes,
  locations,
  memberships,
  packs,
  promoCodes,
  recurrences,
  sessions,
  teachers,
  user,
} from "@/lib/db/schema";
import { confirmedCount, releaseExpiredCheckoutHolds } from "@/lib/booking-service";
import { decideManualBooking } from "@/lib/booking-rules";
import { studioOwnsResource } from "@/lib/checkout-rules";
import { sendIndividually } from "@/lib/email";
import { geocoder } from "@/lib/geocode";
import { collectOccurrences, describeRecurrence, diffSessions, previewOccurrences, type RecurrenceRule } from "@/lib/recurrence";
import { addDaysYmd, ymdInZone, zonedTimeToUtc } from "@/lib/time";
import { uniqueSlug } from "@/lib/utils";

export async function audit(entry: { actorUserId: string; teacherId: string; delegated: boolean; action: string; entityType: string; entityId?: string; summary: string }) {
  if (!entry.delegated) return;
  await db.insert(auditLog).values({
    id: crypto.randomUUID(),
    actorUserId: entry.actorUserId,
    onBehalfOfTeacherId: entry.teacherId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    summary: entry.summary,
  });
}

export async function syncRule(recurrenceId: string, today = ymdInZone(new Date())) {
  const [ruleRow] = await db.select().from(recurrences).where(eq(recurrences.id, recurrenceId)).limit(1);
  if (!ruleRow) return;
  const rule: RecurrenceRule = {
    timezone: ruleRow.timezone,
    frequency: ruleRow.frequency as RecurrenceRule["frequency"],
    days: ruleRow.days,
    startDate: ruleRow.startDate,
    endType: ruleRow.endType as RecurrenceRule["endType"],
    endDate: ruleRow.endDate,
    endCount: ruleRow.endCount,
  };
  const desired = rule.endType === "never"
    ? collectOccurrences(rule, rule.startDate, addDaysYmd(today > rule.startDate ? today : rule.startDate, 56), ruleRow.durationMinutes)
    : previewOccurrences(rule, ruleRow.durationMinutes);
  const existing = await db.select().from(sessions).where(eq(sessions.recurrenceId, recurrenceId));
  const booked = new Set<string>();
  if (existing.length) {
    const links = await db
      .select({ sessionId: bookingSessions.sessionId })
      .from(bookingSessions)
      .innerJoin(bookings, eq(bookings.id, bookingSessions.bookingId))
      .where(and(inArray(bookingSessions.sessionId, existing.map((session) => session.id)), eq(bookings.status, "confirmed")));
    for (const link of links) booked.add(link.sessionId);
  }
  const diff = diffSessions(
    existing.map((session) => ({
      id: session.id,
      date: session.localDate,
      hasBookings: booked.has(session.id),
      exception: session.exception === "moved" || session.exception === "skipped" ? session.exception : null,
    })),
    ruleRow.paused ? [] : desired.map((item) => item.date),
  );
  const byDate = new Map(desired.map((item) => [item.date, item]));
  for (const id of diff.deleteIds) await db.delete(sessions).where(eq(sessions.id, id));
  for (const id of diff.cancelIds) {
    await db.update(sessions).set({ status: "cancelled", cancellationReason: "Removed from the series" }).where(eq(sessions.id, id));
    await notifySession(id, "A session was cancelled", "A session you booked was cancelled because the series schedule changed.");
  }
  for (const id of diff.keepIds) {
    const session = existing.find((item) => item.id === id);
    const next = session ? byDate.get(session.localDate) : undefined;
    if (!session || !next || session.exception) continue;
    if (session.startsAt.getTime() !== next.startsAt.getTime()) {
      await db.update(sessions).set({ startsAt: next.startsAt, endsAt: next.endsAt, status: "scheduled" }).where(eq(sessions.id, id));
      if (booked.has(id)) await notifySession(id, "A session time changed", `Your class moved to ${next.date} at ${next.time}.`);
    }
  }
  const [klass] = await db.select().from(classes).where(eq(classes.id, ruleRow.classId)).limit(1);
  for (const date of diff.createDates) {
    const next = byDate.get(date);
    if (!next || !klass) continue;
    await db.insert(sessions).values({
      id: crypto.randomUUID(),
      classId: klass.id,
      recurrenceId,
      startsAt: next.startsAt,
      endsAt: next.endsAt,
      localDate: next.date,
      capacity: ruleRow.capacity,
      status: "scheduled",
      isDemo: klass.isDemo,
    });
  }
  if (ruleRow.paused) {
    const future = existing.filter((session) => session.localDate >= today && session.status === "scheduled" && !booked.has(session.id));
    for (const session of future) await db.update(sessions).set({ status: "paused" }).where(eq(sessions.id, session.id));
  }
}

async function notifySession(sessionId: string, subject: string, text: string) {
  const links = await db
    .select({ email: user.email, guestEmail: bookings.guestEmail })
    .from(bookingSessions)
    .innerJoin(bookings, eq(bookings.id, bookingSessions.bookingId))
    .leftJoin(user, eq(user.id, bookings.userId))
    .where(and(eq(bookingSessions.sessionId, sessionId), eq(bookings.status, "confirmed")));
  const emails = links.map((link) => link.email || link.guestEmail).filter((value): value is string => Boolean(value));
  if (!emails.length) return;
  await sendIndividually({ recipients: emails, subject, text });
}

export async function saveClass(input: {
  actorUserId: string;
  teacherId: string;
  delegated: boolean;
  classId?: string;
  title: string;
  description: string;
  outcomes: string;
  prerequisites: string;
  whatToBring: string;
  categoryId: string;
  subcategoryId?: string;
  skillLevel: string;
  format: string;
  delivery: string;
  virtualLink?: string;
  maxSize: number;
  durationMinutes: number;
  pricePerSessionCents: number | null;
  pricePerSeriesCents: number | null;
  seriesBookingEnabled: boolean;
  firstClassFree: boolean;
  waitlistEnabled: boolean;
  publish: boolean;
  venueName?: string;
  address?: string;
  neighborhood?: string;
  city?: string;
  postalCode?: string;
  schedule?: { mode: "once"; date: string; time: string } | { mode: "repeat"; rule: RecurrenceRule } | null;
}) {
  const [teacher] = await db.select().from(teachers).where(eq(teachers.id, input.teacherId)).limit(1);
  if (!teacher) return { error: "Teacher not found." };
  if (input.delivery === "virtual" && !input.virtualLink) return { error: "Add a virtual meeting link." };
  if (input.delivery === "in_person" && !input.address) return { error: "In-person classes need an address." };
  let locationId: string | null = null;
  if (input.delivery === "in_person" && input.address) {
    const geo = await geocoder().geocode(`${input.address}, ${input.neighborhood ?? ""} ${input.city ?? "Los Angeles"}`);
    locationId = crypto.randomUUID();
    await db.insert(locations).values({
      id: locationId,
      name: input.venueName || teacher.studioName || teacher.slug,
      addressLine1: input.address,
      city: input.city || "Los Angeles",
      state: "CA",
      postalCode: input.postalCode || "90000",
      neighborhood: input.neighborhood || "Los Angeles",
      lat: geo?.lat ?? 34.05,
      lng: geo?.lng ?? -118.25,
      isDemo: teacher.isDemo,
    });
  }
  const status = input.publish && teacher.status === "approved" ? "published" : "draft";
  const classId = input.classId ?? crypto.randomUUID();
  const values = {
    teacherId: teacher.id,
    categoryId: input.categoryId,
    subcategoryId: input.subcategoryId || null,
    locationId,
    title: input.title,
    description: input.description,
    outcomes: input.outcomes,
    prerequisites: input.prerequisites,
    whatToBring: input.whatToBring,
    skillLevel: input.skillLevel,
    format: input.format,
    delivery: input.delivery,
    virtualLink: input.virtualLink || null,
    maxSize: input.maxSize,
    durationMinutes: input.durationMinutes,
    pricePerSessionCents: input.pricePerSessionCents,
    pricePerSeriesCents: input.pricePerSeriesCents,
    seriesBookingEnabled: input.seriesBookingEnabled,
    firstClassFree: input.firstClassFree,
    waitlistEnabled: input.waitlistEnabled,
    status,
    updatedAt: new Date(),
  };
  if (input.classId) {
    await db.update(classes).set(values).where(and(eq(classes.id, input.classId), eq(classes.teacherId, teacher.id)));
  } else {
    await db.insert(classes).values({ ...values, id: classId, slug: uniqueSlug(input.title), isDemo: false });
  }
  if (input.schedule?.mode === "once") {
    const startsAt = zonedTimeToUtc(input.schedule.date, input.schedule.time);
    await db.insert(sessions).values({
      id: crypto.randomUUID(),
      classId,
      startsAt,
      endsAt: new Date(startsAt.getTime() + input.durationMinutes * 60_000),
      localDate: input.schedule.date,
      capacity: input.maxSize,
      status: "scheduled",
    });
  }
  if (input.schedule?.mode === "repeat") {
    const recurrenceId = crypto.randomUUID();
    await db.insert(recurrences).values({
      id: recurrenceId,
      classId,
      timezone: input.schedule.rule.timezone,
      frequency: input.schedule.rule.frequency,
      days: input.schedule.rule.days,
      startDate: input.schedule.rule.startDate,
      endType: input.schedule.rule.endType,
      endDate: input.schedule.rule.endDate,
      endCount: input.schedule.rule.endCount,
      durationMinutes: input.durationMinutes,
      capacity: input.maxSize,
    });
    await syncRule(recurrenceId);
  }
  await audit({
    actorUserId: input.actorUserId,
    teacherId: teacher.id,
    delegated: input.delegated,
    action: input.classId ? "class.update" : "class.create",
    entityType: "class",
    entityId: classId,
    summary: `${input.classId ? "Updated" : "Created"} ${input.title}${input.schedule?.mode === "repeat" ? `. ${describeRecurrence(input.schedule.rule)}` : ""}`,
  });
  return { classId };
}

async function classTeacherId(classId: string) {
  const [klass] = await db.select({ teacherId: classes.teacherId }).from(classes).where(eq(classes.id, classId)).limit(1);
  return klass?.teacherId ?? null;
}

export async function updateRecurrence(recurrenceId: string, rule: RecurrenceRule, actorUserId: string, delegated: boolean, teacherId: string) {
  const [existing] = await db.select().from(recurrences).where(eq(recurrences.id, recurrenceId)).limit(1);
  if (!existing || !studioOwnsResource(await classTeacherId(existing.classId), teacherId)) return { error: "Series not found." };
  await db.update(recurrences).set({
    timezone: rule.timezone || existing.timezone,
    frequency: rule.frequency,
    days: rule.days,
    startDate: rule.startDate,
    endType: rule.endType,
    endDate: rule.endDate ?? null,
    endCount: rule.endCount ?? null,
    paused: false,
  }).where(eq(recurrences.id, recurrenceId));
  await syncRule(recurrenceId);
  const [klass] = await db.select().from(classes).where(eq(classes.id, existing.classId)).limit(1);
  if (klass) {
    await audit({
      actorUserId,
      teacherId: klass.teacherId,
      delegated,
      action: "series.update",
      entityType: "recurrence",
      entityId: recurrenceId,
      summary: `Changed all future sessions. ${describeRecurrence(rule)}`,
    });
  }
  return { ok: true };
}

export async function setPaused(recurrenceId: string, paused: boolean, actorUserId: string, delegated: boolean, teacherId: string) {
  const [rule] = await db.select().from(recurrences).where(eq(recurrences.id, recurrenceId)).limit(1);
  if (!rule || !studioOwnsResource(await classTeacherId(rule.classId), teacherId)) return;
  await db.update(recurrences).set({ paused }).where(eq(recurrences.id, recurrenceId));
  await syncRule(recurrenceId);
  const [klass] = await db.select().from(classes).where(eq(classes.id, rule.classId)).limit(1);
  if (klass) await audit({ actorUserId, teacherId: klass.teacherId, delegated, action: paused ? "series.pause" : "series.resume", entityType: "recurrence", entityId: recurrenceId, summary: paused ? "Paused the series" : "Resumed the series" });
}

export async function skipSession(sessionId: string, actorUserId: string, delegated: boolean, teacherId: string) {
  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
  if (!session || !studioOwnsResource(await classTeacherId(session.classId), teacherId)) return;
  await db.update(sessions).set({ status: "cancelled", exception: "skipped", cancellationReason: "Teacher skipped this date" }).where(eq(sessions.id, sessionId));
  await notifySession(sessionId, "Class cancelled", "Your teacher cancelled this date. If you paid online, the refund follows the class policy.");
  const [klass] = await db.select().from(classes).where(eq(classes.id, session.classId)).limit(1);
  if (klass) await audit({ actorUserId, teacherId: klass.teacherId, delegated, action: "session.skip", entityType: "session", entityId: sessionId, summary: `Skipped ${session.localDate}` });
}

export async function moveSession(sessionId: string, date: string, time: string, actorUserId: string, delegated: boolean, teacherId: string) {
  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
  if (!session) return;
  const [klass] = await db.select().from(classes).where(eq(classes.id, session.classId)).limit(1);
  if (!studioOwnsResource(klass?.teacherId, teacherId)) return;
  const startsAt = zonedTimeToUtc(date, time);
  const endsAt = new Date(startsAt.getTime() + (klass?.durationMinutes ?? 60) * 60_000);
  await db.update(sessions).set({ startsAt, endsAt, localDate: date, exception: "moved", status: "scheduled" }).where(eq(sessions.id, sessionId));
  await notifySession(sessionId, "Class rescheduled", `Your class moved to ${date} at ${time}.`);
  if (klass) await audit({ actorUserId, teacherId: klass.teacherId, delegated, action: "session.move", entityType: "session", entityId: sessionId, summary: `Moved a session to ${date} ${time}` });
}

export async function manualBook(input: { classId: string; sessionId: string; name: string; email: string; payment: "paid" | "pay_at_studio" | "unpaid"; override: boolean; actorUserId: string; delegated: boolean }) {
  const [klass] = await db.select().from(classes).where(eq(classes.id, input.classId)).limit(1);
  if (!klass) return { error: "Class not found." };
  const [session] = await db.select().from(sessions).where(eq(sessions.id, input.sessionId)).limit(1);
  if (!session) return { error: "Session not found." };
  await releaseExpiredCheckoutHolds();
  const decision = decideManualBooking({ capacity: session.capacity, confirmedCount: await confirmedCount(session.id), override: input.override });
  if (!decision.ok) return { error: "This session is full. Check override capacity to add someone anyway." };
  const bookingId = crypto.randomUUID();
  await db.insert(bookings).values({
    id: bookingId,
    classId: klass.id,
    kind: "session",
    status: "confirmed",
    guestName: input.name,
    guestEmail: input.email,
    source: "manual",
    notes: input.payment,
  });
  await db.insert(bookingSessions).values({ id: crypto.randomUUID(), bookingId, sessionId: input.sessionId });
  await audit({ actorUserId: input.actorUserId, teacherId: klass.teacherId, delegated: input.delegated, action: "booking.manual", entityType: "booking", entityId: bookingId, summary: `Added ${input.name} by hand (${input.payment})` });
  return { ok: true };
}

export async function setCheckin(bookingSessionId: string, checkedIn: boolean, teacherId: string) {
  const [row] = await db
    .select({ ownerId: classes.teacherId })
    .from(bookingSessions)
    .innerJoin(sessions, eq(sessions.id, bookingSessions.sessionId))
    .innerJoin(classes, eq(classes.id, sessions.classId))
    .where(eq(bookingSessions.id, bookingSessionId))
    .limit(1);
  if (!row || !studioOwnsResource(row.ownerId, teacherId)) return;
  await db.update(bookingSessions).set({ checkedIn, checkedInAt: checkedIn ? new Date() : null }).where(eq(bookingSessions.id, bookingSessionId));
}

export async function emailRoster(input: { sessionId?: string; classId?: string; includePast: boolean; subject: string; body: string; teacherId: string }) {
  let classId = input.classId ?? "";
  if (input.sessionId) {
    const [session] = await db.select({ classId: sessions.classId }).from(sessions).where(eq(sessions.id, input.sessionId)).limit(1);
    classId = session?.classId ?? "";
  }
  if (!studioOwnsResource(await classTeacherId(classId), input.teacherId)) return { error: "You can't email this roster." };
  const now = new Date();
  const sessionRows = input.sessionId
    ? await db.select().from(sessions).where(eq(sessions.id, input.sessionId))
    : await db.select().from(sessions).where(eq(sessions.classId, input.classId ?? ""));
  const ids = sessionRows.filter((session) => input.includePast || session.startsAt >= now).map((session) => session.id);
  if (!ids.length) return { error: "No sessions to email." };
  const people = await db
    .select({ email: user.email, guest: bookings.guestEmail })
    .from(bookingSessions)
    .innerJoin(bookings, eq(bookings.id, bookingSessions.bookingId))
    .leftJoin(user, eq(user.id, bookings.userId))
    .where(and(inArray(bookingSessions.sessionId, ids), eq(bookings.status, "confirmed")));
  const recipients = people.map((person) => person.email || person.guest).filter((value): value is string => Boolean(value));
  if (!recipients.length) return { error: "Nobody is booked yet." };
  const sent = await sendIndividually({ recipients, subject: input.subject, text: input.body, teacherId: input.teacherId });
  return { ok: `Sent to ${sent.count} student${sent.count === 1 ? "" : "s"}.` };
}

export async function savePack(input: { teacherId: string; name: string; creditCount: number; priceCents: number; expiryDays: number; classIds: string[]; description: string; actorUserId: string; delegated: boolean }) {
  const id = crypto.randomUUID();
  await db.insert(packs).values({ id, teacherId: input.teacherId, slug: uniqueSlug(input.name), name: input.name, creditCount: input.creditCount, priceCents: input.priceCents, expiryDays: input.expiryDays, classIds: input.classIds, description: input.description });
  await audit({ actorUserId: input.actorUserId, teacherId: input.teacherId, delegated: input.delegated, action: "pack.create", entityType: "pack", entityId: id, summary: `Created pack ${input.name}` });
  return id;
}

export async function saveMembership(input: { teacherId: string; name: string; termMonths: number; kind: string; classesPerPeriod: number | null; priceCents: number; recurring: boolean; policy: string; classIds: string[]; actorUserId: string; delegated: boolean }) {
  const id = crypto.randomUUID();
  await db.insert(memberships).values({
    id,
    teacherId: input.teacherId,
    slug: uniqueSlug(input.name),
    name: input.name,
    termMonths: input.termMonths,
    kind: input.kind,
    classesPerPeriod: input.classesPerPeriod,
    priceCents: input.priceCents,
    recurring: input.recurring,
    pauseCancelPolicy: input.policy,
    classIds: input.classIds,
  });
  await audit({ actorUserId: input.actorUserId, teacherId: input.teacherId, delegated: input.delegated, action: "membership.create", entityType: "membership", entityId: id, summary: `Created membership ${input.name}` });
  return id;
}

export async function savePromo(input: {
  teacherId: string | null;
  code: string;
  discountType: "percent" | "fixed";
  percentOffBps: number;
  amountOffCents: number;
  appliesTo: string;
  funding: string;
  platformSharePercent: number;
  maxRedemptions: number | null;
  maxPerCustomer: number | null;
  firstTimeOnly: boolean;
  minPurchaseCents: number;
  classIds: string[];
  actorUserId: string;
  delegated: boolean;
}) {
  const id = crypto.randomUUID();
  await db.insert(promoCodes).values({
    id,
    teacherId: input.teacherId,
    code: input.code.trim().toUpperCase(),
    discountType: input.discountType,
    percentOffBps: input.percentOffBps,
    amountOffCents: input.amountOffCents,
    appliesTo: input.appliesTo,
    funding: input.funding,
    platformSharePercent: input.platformSharePercent,
    maxRedemptions: input.maxRedemptions,
    maxPerCustomer: input.maxPerCustomer,
    firstTimeOnly: input.firstTimeOnly,
    minPurchaseCents: input.minPurchaseCents,
    classIds: input.classIds,
  });
  if (input.teacherId) {
    await audit({ actorUserId: input.actorUserId, teacherId: input.teacherId, delegated: input.delegated, action: "promo.create", entityType: "promo", entityId: id, summary: `Created code ${input.code}` });
  }
  return id;
}

export async function attachMedia(classId: string, url: string, type: "image" | "video") {
  await db.insert(classMedia).values({ id: crypto.randomUUID(), classId, url, type, sortOrder: 0 });
  if (type === "image") {
    const [klass] = await db.select().from(classes).where(eq(classes.id, classId)).limit(1);
    if (klass && !klass.coverImageUrl) await db.update(classes).set({ coverImageUrl: url }).where(eq(classes.id, classId));
  }
}

export async function featureClass(classId: string, featured: boolean) {
  await db.update(classes).set({ featured }).where(eq(classes.id, classId));
}

export async function setTeacherStatus(teacherId: string, status: "approved" | "rejected" | "pending", reason?: string) {
  await db.update(teachers).set({ status, rejectionReason: reason ?? null, updatedAt: new Date() }).where(eq(teachers.id, teacherId));
}
