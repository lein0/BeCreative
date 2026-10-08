import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { funnelReport } from "@/lib/analytics-math";
import { STUDENT_FUNNEL, TEACHER_FUNNEL } from "@/lib/analytics-events";
import { twoProportionZ, variantScore } from "@/lib/analytics-math";
import { db } from "@/lib/db";
import {
  analyticsEvents,
  bookingSessions,
  bookings,
  classes,
  disputes,
  experimentVariants,
  experiments,
  linkClicks,
  orders,
  teachers,
  user,
  userRoles,
} from "@/lib/db/schema";

export type AnalyticsFilter = {
  from: Date;
  to: Date;
  source?: string;
  utmSource?: string;
  shareCode?: string;
  vertical?: string;
  category?: string;
  platform?: string;
  device?: string;
  city?: string;
};

function inRange(filter: AnalyticsFilter) {
  const parts = [gte(analyticsEvents.createdAt, filter.from), lte(analyticsEvents.createdAt, filter.to)];
  if (filter.source) parts.push(eq(analyticsEvents.source, filter.source));
  if (filter.utmSource) parts.push(eq(analyticsEvents.utmSource, filter.utmSource));
  if (filter.shareCode) parts.push(eq(analyticsEvents.shareCode, filter.shareCode));
  if (filter.vertical) parts.push(eq(analyticsEvents.vertical, filter.vertical));
  if (filter.category) parts.push(eq(analyticsEvents.category, filter.category));
  if (filter.platform) parts.push(eq(analyticsEvents.platform, filter.platform));
  if (filter.device) parts.push(eq(analyticsEvents.device, filter.device));
  if (filter.city) parts.push(eq(analyticsEvents.city, filter.city));
  return and(...parts);
}

export function rangeFromSearch(search: Record<string, string | string[] | undefined>, now = new Date()) {
  const days = Number(typeof search.days === "string" ? search.days : 30);
  const span = Number.isFinite(days) && days > 0 ? days : 30;
  const to = new Date(now);
  const from = new Date(now.getTime() - span * 86_400_000);
  const one = (key: string) => (typeof search[key] === "string" ? search[key] : "") || undefined;
  return {
    from,
    to,
    days: span,
    source: one("source"),
    utmSource: one("utm"),
    shareCode: one("share"),
    vertical: one("vertical"),
    category: one("category"),
    platform: one("platform"),
    device: one("device"),
    city: one("city"),
  } satisfies AnalyticsFilter & { days: number };
}

export async function platformKpis(filter: AnalyticsFilter) {
  const orderRows = await db.select().from(orders).where(and(gte(orders.createdAt, filter.from), lte(orders.createdAt, filter.to)));
  const paid = orderRows.filter((order) => order.status === "paid" || order.status === "pay_at_studio");
  const gmv = paid.reduce((sum, order) => sum + order.studentPaysCents, 0);
  const take = paid.reduce((sum, order) => sum + order.platformFeeCents, 0);
  const refunded = orderRows.reduce((sum, order) => sum + order.refundedCents, 0);
  const bookingRows = await db.select().from(bookings).where(and(gte(bookings.createdAt, filter.from), lte(bookings.createdAt, filter.to)));
  const confirmed = bookingRows.filter((booking) => booking.status === "confirmed");
  const students = new Set(confirmed.map((booking) => booking.userId).filter(Boolean));
  const counts = new Map<string, number>();
  for (const booking of confirmed) {
    if (!booking.userId) continue;
    counts.set(booking.userId, (counts.get(booking.userId) ?? 0) + 1);
  }
  const repeaters = [...counts.values()].filter((count) => count > 1).length;
  const newStudents = await db.select({ id: user.id }).from(user).innerJoin(userRoles, eq(userRoles.userId, user.id)).where(and(eq(userRoles.role, "student"), gte(user.createdAt, filter.from), lte(user.createdAt, filter.to)));
  const teacherRows = await db.select().from(teachers).where(and(gte(teachers.createdAt, filter.from), lte(teachers.createdAt, filter.to)));
  const activeTeachers = new Set(paid.map((order) => order.teacherId).filter(Boolean));
  const disputeRows = await db.select().from(disputes).where(and(gte(disputes.createdAt, filter.from), lte(disputes.createdAt, filter.to)));
  const paying = new Set(paid.map((order) => order.userId).filter(Boolean));
  return {
    gmv,
    take,
    bookings: confirmed.length,
    newStudents: newStudents.length,
    activeStudents: students.size,
    newTeachers: teacherRows.length,
    activeTeachers: activeTeachers.size,
    repeatRate: students.size ? repeaters / students.size : 0,
    refundRate: gmv ? refunded / gmv : 0,
    disputeRate: paid.length ? disputeRows.length / paid.length : 0,
    ltv: paying.size ? gmv / paying.size : 0,
  };
}

function subjectOf(row: { userId: string | null; anonymousId: string | null }) {
  return row.userId || row.anonymousId || "";
}

export async function studentFunnel(filter: AnalyticsFilter) {
  const rows = await db.select().from(analyticsEvents).where(inRange(filter));
  const sets = new Map<string, Set<string>>();
  for (const row of rows) {
    const subject = subjectOf(row);
    if (!subject) continue;
    const bucket = sets.get(row.name) ?? new Set<string>();
    bucket.add(subject);
    sets.set(row.name, bucket);
  }
  const paidSubjects = sets.get("checkout_completed") ?? new Set<string>();
  const paidUsers = rows.filter((row) => row.name === "checkout_completed" && row.userId).map((row) => row.userId!);
  let attended = 0;
  let rebooked = 0;
  if (paidUsers.length) {
    const links = await db
      .select({ userId: bookings.userId, checkedIn: bookingSessions.checkedIn, createdAt: bookings.createdAt })
      .from(bookingSessions)
      .innerJoin(bookings, eq(bookings.id, bookingSessions.bookingId))
      .where(inArray(bookings.userId, paidUsers));
    const attendedUsers = new Set(links.filter((link) => link.checkedIn && link.userId).map((link) => link.userId!));
    attended = [...paidSubjects].filter((subject) => attendedUsers.has(subject)).length;
    const byUser = new Map<string, Date[]>();
    for (const link of links) {
      if (!link.userId) continue;
      const list = byUser.get(link.userId) ?? [];
      list.push(link.createdAt);
      byUser.set(link.userId, list);
    }
    for (const dates of byUser.values()) {
      dates.sort((a, b) => a.getTime() - b.getTime());
      const first = dates[0];
      if (first && dates.some((date) => date.getTime() - first.getTime() > 0 && date.getTime() - first.getTime() <= 30 * 86_400_000)) rebooked += 1;
    }
  }
  const steps = STUDENT_FUNNEL.map((step) => {
    if (step.key === "attended") return { name: step.label, count: attended };
    if (step.key === "rebooked_30d") return { name: step.label, count: rebooked };
    const people = new Set<string>();
    for (const name of step.events) for (const subject of sets.get(name) ?? []) people.add(subject);
    return { name: step.label, count: people.size };
  });
  return funnelReport(steps);
}

export async function teacherFunnel(filter: AnalyticsFilter) {
  const studios = await db.select().from(teachers).where(and(gte(teachers.createdAt, filter.from), lte(teachers.createdAt, filter.to)));
  const ids = studios.map((teacher) => teacher.id);
  const classRows = ids.length ? await db.select().from(classes).where(inArray(classes.teacherId, ids)) : [];
  const bookingRows = classRows.length ? await db.select().from(bookings).where(and(inArray(bookings.classId, classRows.map((klass) => klass.id)), eq(bookings.status, "confirmed"))) : [];
  const published = new Set(classRows.filter((klass) => klass.status === "published").map((klass) => klass.teacherId));
  const bookingCount = new Map<string, number>();
  for (const booking of bookingRows) {
    const klass = classRows.find((item) => item.id === booking.classId);
    if (!klass) continue;
    bookingCount.set(klass.teacherId, (bookingCount.get(klass.teacherId) ?? 0) + 1);
  }
  const steps = [
    { name: TEACHER_FUNNEL[0]!.label, count: studios.length },
    { name: TEACHER_FUNNEL[1]!.label, count: studios.filter((teacher) => teacher.bio.trim().length > 20).length },
    { name: TEACHER_FUNNEL[2]!.label, count: studios.filter((teacher) => published.has(teacher.id)).length },
    { name: TEACHER_FUNNEL[3]!.label, count: studios.filter((teacher) => teacher.stripeChargesEnabled).length },
    { name: TEACHER_FUNNEL[4]!.label, count: studios.filter((teacher) => (bookingCount.get(teacher.id) ?? 0) >= 1).length },
    { name: TEACHER_FUNNEL[5]!.label, count: studios.filter((teacher) => (bookingCount.get(teacher.id) ?? 0) >= 5).length },
  ];
  return funnelReport(steps);
}

export async function cohortRetention(filter: AnalyticsFilter) {
  const rows = await db.select().from(bookings).where(and(eq(bookings.status, "confirmed"), gte(bookings.createdAt, new Date(filter.to.getTime() - 120 * 86_400_000)), lte(bookings.createdAt, filter.to)));
  const byUser = new Map<string, Date[]>();
  for (const row of rows) {
    if (!row.userId) continue;
    const list = byUser.get(row.userId) ?? [];
    list.push(row.createdAt);
    byUser.set(row.userId, list);
  }
  const cohorts = new Map<string, { size: number; month1: number; month2: number }>();
  for (const dates of byUser.values()) {
    dates.sort((a, b) => a.getTime() - b.getTime());
    const first = dates[0]!;
    const key = first.toISOString().slice(0, 7);
    const bucket = cohorts.get(key) ?? { size: 0, month1: 0, month2: 0 };
    bucket.size += 1;
    if (dates.some((date) => date.getTime() - first.getTime() >= 28 * 86_400_000 && date.getTime() - first.getTime() < 62 * 86_400_000)) bucket.month1 += 1;
    if (dates.some((date) => date.getTime() - first.getTime() >= 62 * 86_400_000 && date.getTime() - first.getTime() < 95 * 86_400_000)) bucket.month2 += 1;
    cohorts.set(key, bucket);
  }
  return [...cohorts.entries()].sort(([a], [b]) => a.localeCompare(b));
}

export async function topLists(filter: AnalyticsFilter) {
  const paid = await db.select().from(orders).where(and(gte(orders.createdAt, filter.from), lte(orders.createdAt, filter.to), sql`${orders.status} in ('paid', 'pay_at_studio')`));
  const classIds = [...new Set(paid.map((order) => order.teacherId).filter(Boolean))] as string[];
  const teacherRows = classIds.length ? await db.select().from(teachers).where(inArray(teachers.id, classIds)) : [];
  const byTeacher = new Map<string, { name: string; gmv: number; bookings: number }>();
  for (const order of paid) {
    if (!order.teacherId) continue;
    const teacher = teacherRows.find((item) => item.id === order.teacherId);
    const current = byTeacher.get(order.teacherId) ?? { name: teacher?.studioName || teacher?.slug || "Studio", gmv: 0, bookings: 0 };
    current.gmv += order.studentPaysCents;
    current.bookings += 1;
    byTeacher.set(order.teacherId, current);
  }
  const sources = await db
    .select({ source: analyticsEvents.utmSource, count: sql<number>`count(*)::int` })
    .from(analyticsEvents)
    .where(and(inRange(filter), sql`${analyticsEvents.utmSource} is not null`))
    .groupBy(analyticsEvents.utmSource)
    .orderBy(sql`count(*) desc`)
    .limit(8);
  return {
    teachers: [...byTeacher.values()].sort((a, b) => b.gmv - a.gmv).slice(0, 8),
    sources,
  };
}

export async function teacherClassAnalytics(teacherId: string) {
  const classRows = await db.select().from(classes).where(eq(classes.teacherId, teacherId));
  const ids = classRows.map((klass) => klass.id);
  const bookingRows = ids.length ? await db.select().from(bookings).where(and(inArray(bookings.classId, ids), eq(bookings.status, "confirmed"))) : [];
  const orderRows = await db.select().from(orders).where(eq(orders.teacherId, teacherId));
  const views = ids.length
    ? await db.select().from(analyticsEvents).where(and(eq(analyticsEvents.name, "class_viewed"), sql`${analyticsEvents.properties}->>'teacherId' = ${teacherId}`))
    : [];
  return classRows.map((klass) => {
    const mine = bookingRows.filter((booking) => booking.classId === klass.id);
    const viewCount = views.filter((event) => event.properties.classId === klass.id || event.path === `/c/${klass.slug}`).length;
    const revenue = orderRows.filter((order) => mine.some((booking) => booking.orderId === order.id)).reduce((sum, order) => sum + order.teacherAmountCents, 0);
    return { id: klass.id, title: klass.title, views: viewCount, bookings: mine.length, revenue };
  });
}

export async function shareConversions(teacherId: string) {
  const clicks = await db.select().from(linkClicks).where(eq(linkClicks.teacherId, teacherId));
  const ordersForTeacher = await db.select().from(orders).where(eq(orders.teacherId, teacherId));
  const groups = new Map<string, { clicks: number; bookings: number }>();
  for (const click of clicks) {
    const key = click.code || click.ref || "direct";
    const row = groups.get(key) ?? { clicks: 0, bookings: 0 };
    row.clicks += 1;
    groups.set(key, row);
  }
  for (const order of ordersForTeacher) {
    const key = order.ref || "direct";
    const row = groups.get(key) ?? { clicks: 0, bookings: 0 };
    if (order.status === "paid" || order.status === "pay_at_studio") row.bookings += 1;
    groups.set(key, row);
  }
  return [...groups.entries()].map(([name, stats]) => ({ name, ...stats, rate: stats.clicks ? stats.bookings / stats.clicks : 0 })).sort((a, b) => b.bookings - a.bookings);
}

export async function experimentResults(key: string) {
  const [experiment] = await db.select().from(experiments).where(eq(experiments.key, key)).limit(1);
  if (!experiment) return null;
  const variants = await db.select().from(experimentVariants).where(eq(experimentVariants.experimentId, experiment.id));
  const exposures = await db.select().from(analyticsEvents).where(and(eq(analyticsEvents.name, "experiment_exposed"), sql`${analyticsEvents.properties}->>'experiment' = ${key}`));
  const goals = await db.select().from(analyticsEvents).where(eq(analyticsEvents.name, experiment.goalEvent));
  const goalSubjects = new Set(goals.map(subjectOf).filter(Boolean));
  const scores = variants.map((variant) => {
    const seen = new Set(exposures.filter((event) => event.properties.variant === variant.key).map(subjectOf).filter(Boolean));
    const converted = [...seen].filter((subject) => goalSubjects.has(subject)).length;
    return { key: variant.key, weight: variant.weight, ...variantScore(seen.size, converted) };
  });
  const control = scores[0];
  const compared = scores.slice(1).map((score) => ({
    ...score,
    ...twoProportionZ({ success: control?.converted ?? 0, total: control?.exposed ?? 0 }, { success: score.converted, total: score.exposed }),
  }));
  return { experiment, variants: scores, compared };
}

export async function analyticsCsv(filter: AnalyticsFilter) {
  const kpis = await platformKpis(filter);
  const funnel = await studentFunnel(filter);
  const lines = [
    "metric,value",
    `gmv_cents,${kpis.gmv}`,
    `take_cents,${kpis.take}`,
    `bookings,${kpis.bookings}`,
    `new_students,${kpis.newStudents}`,
    `active_students,${kpis.activeStudents}`,
    `repeat_rate,${kpis.repeatRate.toFixed(4)}`,
    `refund_rate,${kpis.refundRate.toFixed(4)}`,
    `dispute_rate,${kpis.disputeRate.toFixed(4)}`,
    `ltv_cents,${Math.round(kpis.ltv)}`,
    "",
    "funnel_step,count,conversion,drop_off",
    ...funnel.map((step) => `${step.name},${step.count},${step.conversion.toFixed(4)},${step.dropOff.toFixed(4)}`),
  ];
  return lines.join("\n");
}

export async function listExperiments() {
  return db.select().from(experiments).orderBy(experiments.createdAt);
}
