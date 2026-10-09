import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { studioCanSell } from "@/lib/review-rules";
import {
  availabilityWindows,
  bookingSessions,
  bookings,
  categories,
  classMedia,
  classes,
  credentials,
  creditLedger,
  leads,
  linkClicks,
  locations,
  membershipSubscriptions,
  memberships,
  orders,
  packPurchases,
  packs,
  payouts,
  promoCodes,
  promoRedemptions,
  recurrences,
  reviews,
  serviceOptions,
  services,
  sessions,
  teachers,
  user,
  userRoles,
  visitBookings,
} from "@/lib/db/schema";
import { releaseExpiredCheckoutHolds } from "@/lib/booking-service";
import { visitDurationMinutes, visitListPriceCents } from "@/lib/explore-filters";
import { publicListingVisible } from "@/lib/review-rules";
import { ymdInZone } from "@/lib/time";

export async function categoryTree() {
  return db.select().from(categories).orderBy(asc(categories.name));
}

export async function catalog(filters: {
  q?: string;
  category?: string;
  level?: string;
  format?: string;
  delivery?: string;
  maxPrice?: number;
  date?: string;
  lat?: number;
  lng?: number;
  miles?: number;
  vertical?: string;
}) {
  const rows = await db
    .select({
      class: classes,
      teacher: teachers,
      location: locations,
      category: categories,
    })
    .from(classes)
    .innerJoin(teachers, eq(teachers.id, classes.teacherId))
    .innerJoin(categories, eq(categories.id, classes.categoryId))
    .leftJoin(locations, eq(locations.id, classes.locationId))
    .where(and(eq(classes.status, "published"), eq(teachers.status, "approved")));
  const ids = rows.map((row) => row.class.id);
  const upcoming = ids.length
    ? await db.select().from(sessions).where(and(inArray(sessions.classId, ids), eq(sessions.status, "scheduled"), gte(sessions.startsAt, new Date()))).orderBy(asc(sessions.startsAt))
    : [];
  const nextByClass = new Map<string, (typeof upcoming)[number]>();
  for (const session of upcoming) if (!nextByClass.has(session.classId)) nextByClass.set(session.classId, session);
  const counts = upcoming.length ? await countMap(upcoming.map((session) => session.id)) : new Map<string, number>();
  return rows
    .map((row) => {
      const next = nextByClass.get(row.class.id) ?? null;
      const price = row.class.pricePerSessionCents ?? row.class.pricePerSeriesCents ?? 0;
      const miles = filters.lat != null && filters.lng != null && row.location ? haversine(filters.lat, filters.lng, row.location.lat, row.location.lng) : null;
      return { ...row, next, spots: next ? Math.max(0, next.capacity - (counts.get(next.id) ?? 0)) : null, price, miles };
    })
    .filter((row) => {
      if (filters.q) {
        const hay = `${row.class.title} ${row.teacher.studioName ?? ""} ${row.category.name} ${row.class.description}`.toLowerCase();
        if (!hay.includes(filters.q.toLowerCase())) return false;
      }
      if (filters.category && row.category.slug !== filters.category && row.class.categoryId !== filters.category) return false;
      if (filters.level && row.class.skillLevel !== filters.level) return false;
      if (filters.format && row.class.format !== filters.format) return false;
      if (filters.delivery && row.class.delivery !== filters.delivery) return false;
      if (filters.maxPrice && row.price > filters.maxPrice * 100) return false;
      if (filters.date && (!row.next || row.next.localDate < filters.date)) return false;
      if (filters.miles && row.class.delivery === "in_person" && (row.miles == null || row.miles > filters.miles)) return false;
      if (filters.vertical && row.category.vertical !== filters.vertical) return false;
      return true;
    });
}

export async function publishedServices() {
  return db
    .select({ service: services, teacher: teachers, location: locations, category: categories })
    .from(services)
    .innerJoin(teachers, eq(teachers.id, services.teacherId))
    .innerJoin(categories, eq(categories.id, services.categoryId))
    .leftJoin(locations, eq(locations.id, services.locationId))
    .where(and(eq(services.status, "published"), eq(teachers.status, "approved"), eq(categories.vertical, "wellness")));
}

export async function publishedServiceExplore() {
  const rows = await publishedServices();
  if (!rows.length) return [];
  const ids = rows.map((row) => row.service.id);
  const [windows, options] = await Promise.all([
    db.select().from(availabilityWindows).where(inArray(availabilityWindows.serviceId, ids)),
    db.select().from(serviceOptions).where(inArray(serviceOptions.serviceId, ids)),
  ]);
  return rows.map((row) => {
    const optionRows = options.filter((option) => option.serviceId === row.service.id);
    return {
      ...row,
      priceCents: visitListPriceCents(row.service.kind, row.service.priceCents, optionRows.map((option) => option.priceCents)),
      durationMinutes: visitDurationMinutes(row.service.kind, row.service.slotMinutes, optionRows.map((option) => option.minutes)),
      windows: windows
        .filter((window) => window.serviceId === row.service.id)
        .map((window) => ({ weekday: window.weekday, start: window.startTime, end: window.endTime })),
    };
  });
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number) {
  const r = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
}

async function countMap(sessionIds: string[]) {
  if (!sessionIds.length) return new Map<string, number>();
  await releaseExpiredCheckoutHolds();
  const rows = await db
    .select({ sessionId: bookingSessions.sessionId, count: sql<number>`count(*)::int` })
    .from(bookingSessions)
    .innerJoin(bookings, eq(bookings.id, bookingSessions.bookingId))
    .where(and(inArray(bookingSessions.sessionId, sessionIds), eq(bookings.status, "confirmed")))
    .groupBy(bookingSessions.sessionId);
  return new Map(rows.map((row) => [row.sessionId, Number(row.count)]));
}

export async function classDetail(slug: string) {
  const [row] = await db
    .select({ class: classes, teacher: teachers, location: locations, category: categories })
    .from(classes)
    .innerJoin(teachers, eq(teachers.id, classes.teacherId))
    .innerJoin(categories, eq(categories.id, classes.categoryId))
    .leftJoin(locations, eq(locations.id, classes.locationId))
    .where(eq(classes.slug, slug))
    .limit(1);
  if (!row || !publicListingVisible({ classStatus: row.class.status, teacherStatus: row.teacher.status })) return null;
  const [media, upcoming, reviewRows, teacherPacks, teacherMemberships, subs] = await Promise.all([
    db.select().from(classMedia).where(eq(classMedia.classId, row.class.id)).orderBy(asc(classMedia.sortOrder)),
    db.select().from(sessions).where(and(eq(sessions.classId, row.class.id), gte(sessions.startsAt, new Date()))).orderBy(asc(sessions.startsAt)),
    db.select({ review: reviews, name: user.name }).from(reviews).innerJoin(user, eq(user.id, reviews.userId)).where(eq(reviews.teacherId, row.teacher.id)).limit(6),
    db.select().from(packs).where(and(eq(packs.teacherId, row.teacher.id), eq(packs.active, true))),
    db.select().from(memberships).where(and(eq(memberships.teacherId, row.teacher.id), eq(memberships.active, true))),
    db.select().from(categories).where(eq(categories.id, row.class.subcategoryId ?? "")),
  ]);
  const counts = await countMap(upcoming.map((session) => session.id));
  return { ...row, media, upcoming: upcoming.map((session) => ({ ...session, spots: Math.max(0, session.capacity - (counts.get(session.id) ?? 0)) })), reviews: reviewRows, packs: teacherPacks, memberships: teacherMemberships, subcategory: subs[0] ?? null };
}

export async function teacherProfile(slug: string) {
  const [teacher] = await db.select().from(teachers).where(eq(teachers.slug, slug)).limit(1);
  if (!teacher || !studioCanSell(teacher.status)) return null;
  const [person] = await db.select().from(user).where(eq(user.id, teacher.userId)).limit(1);
  const offerings = await db.select().from(classes).where(and(eq(classes.teacherId, teacher.id), eq(classes.status, "published")));
  const upcoming = offerings.length
    ? await db.select().from(sessions).where(and(inArray(sessions.classId, offerings.map((item) => item.id)), eq(sessions.status, "scheduled"), gte(sessions.startsAt, new Date()))).orderBy(asc(sessions.startsAt))
    : [];
  const [teacherPacks, teacherMemberships, reviewRows, codes, creds, studioServices] = await Promise.all([
    db.select().from(packs).where(and(eq(packs.teacherId, teacher.id), eq(packs.active, true))),
    db.select().from(memberships).where(and(eq(memberships.teacherId, teacher.id), eq(memberships.active, true))),
    db.select({ review: reviews, name: user.name }).from(reviews).innerJoin(user, eq(user.id, reviews.userId)).where(eq(reviews.teacherId, teacher.id)).limit(8),
    db.select().from(promoCodes).where(and(eq(promoCodes.teacherId, teacher.id), eq(promoCodes.active, true))),
    db.select().from(credentials).where(eq(credentials.teacherId, teacher.id)),
    db.select().from(services).where(and(eq(services.teacherId, teacher.id), eq(services.status, "published"))),
  ]);
  return { teacher, person, offerings, upcoming, packs: teacherPacks, memberships: teacherMemberships, reviews: reviewRows, codes, credentials: creds, services: studioServices };
}

export async function teacherByUser(userId: string) {
  const [teacher] = await db.select().from(teachers).where(eq(teachers.userId, userId)).limit(1);
  return teacher ?? null;
}

export async function studioHome(teacherId: string) {
  const [teacher] = await db.select().from(teachers).where(eq(teachers.id, teacherId)).limit(1);
  const classRows = await db.select().from(classes).where(eq(classes.teacherId, teacherId)).orderBy(desc(classes.createdAt));
  const upcoming = classRows.length
    ? await db.select().from(sessions).where(and(inArray(sessions.classId, classRows.map((item) => item.id)), gte(sessions.startsAt, new Date()))).orderBy(asc(sessions.startsAt)).limit(8)
    : [];
  const serviceRows = await db.select().from(services).where(eq(services.teacherId, teacherId)).orderBy(desc(services.createdAt));
  const visitRows = await db
    .select({ visit: visitBookings, service: services })
    .from(visitBookings)
    .innerJoin(services, eq(services.id, visitBookings.serviceId))
    .where(and(eq(services.teacherId, teacherId), eq(visitBookings.status, "confirmed"), gte(visitBookings.startsAt, new Date())))
    .orderBy(asc(visitBookings.startsAt))
    .limit(8);
  return { teacher, classRows, upcoming, serviceRows, visitRows };
}

export async function classStudio(classId: string) {
  const [klass] = await db.select().from(classes).where(eq(classes.id, classId)).limit(1);
  if (!klass) return null;
  const [media, rules, upcoming, location] = await Promise.all([
    db.select().from(classMedia).where(eq(classMedia.classId, classId)),
    db.select().from(recurrences).where(eq(recurrences.classId, classId)),
    db.select().from(sessions).where(eq(sessions.classId, classId)).orderBy(asc(sessions.startsAt)),
    klass.locationId ? db.select().from(locations).where(eq(locations.id, klass.locationId)) : Promise.resolve([]),
  ]);
  return { klass, media, rules, upcoming, location: location[0] ?? null };
}

export async function roster(sessionId: string) {
  await releaseExpiredCheckoutHolds();
  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
  if (!session) return null;
  const [klass] = await db.select().from(classes).where(eq(classes.id, session.classId)).limit(1);
  const people = await db
    .select({
      link: bookingSessions,
      booking: bookings,
      student: user,
      order: orders,
    })
    .from(bookingSessions)
    .innerJoin(bookings, eq(bookings.id, bookingSessions.bookingId))
    .leftJoin(user, eq(user.id, bookings.userId))
    .leftJoin(orders, eq(orders.id, bookings.orderId))
    .where(eq(bookingSessions.sessionId, sessionId));
  return { session, klass, people };
}

export async function teacherReport(teacherId: string) {
  const classRows = await db.select().from(classes).where(eq(classes.teacherId, teacherId));
  const ids = classRows.map((item) => item.id);
  const sessionRows = ids.length ? await db.select().from(sessions).where(inArray(sessions.classId, ids)) : [];
  const orderRows = await db.select().from(orders).where(eq(orders.teacherId, teacherId));
  const clicks = await db.select().from(linkClicks).where(eq(linkClicks.teacherId, teacherId));
  const codes = await db.select().from(promoCodes).where(eq(promoCodes.teacherId, teacherId));
  const redemptions = codes.length ? await db.select().from(promoRedemptions).where(inArray(promoRedemptions.promoCodeId, codes.map((code) => code.id))) : [];
  const packRows = await db.select().from(packs).where(eq(packs.teacherId, teacherId));
  const purchases = packRows.length ? await db.select().from(packPurchases).where(eq(packPurchases.teacherId, teacherId)) : [];
  const bookingRows = ids.length ? await db.select().from(bookings).where(and(inArray(bookings.classId, ids), eq(bookings.status, "confirmed"))) : [];
  const byStudent = new Map<string, number>();
  for (const booking of bookingRows) {
    const key = booking.userId ?? booking.guestEmail ?? booking.id;
    byStudent.set(key, (byStudent.get(key) ?? 0) + 1);
  }
  const repeats = [...byStudent.values()].filter((count) => count > 1).length;
  const weeks = new Map<string, number>();
  for (const booking of bookingRows) {
    const key = ymdInZone(booking.createdAt).slice(0, 7);
    weeks.set(key, (weeks.get(key) ?? 0) + 1);
  }
  const capacity = sessionRows.reduce((sum, session) => sum + session.capacity, 0);
  const filled = bookingRows.length;
  return {
    bookings: bookingRows.length,
    revenue: orderRows.filter((order) => order.status === "paid" || order.status === "pay_at_studio").reduce((sum, order) => sum + order.teacherAmountCents, 0),
    fill: capacity ? Math.round((filled / capacity) * 100) : 0,
    repeats,
    weeks: [...weeks.entries()],
    clicks: clicks.length,
    byRef: groupCount(clicks.map((click) => click.ref || "direct")),
    attributed: orderRows.filter((order) => order.ref).length,
    codes: codes.map((code) => ({
      code,
      redemptions: redemptions.filter((row) => row.promoCodeId === code.id && !row.reversed).length,
      discount: redemptions.filter((row) => row.promoCodeId === code.id).reduce((sum, row) => sum + row.discountCents, 0),
    })),
    packSales: purchases.length,
  };
}

function groupCount(values: string[]) {
  const map = new Map<string, number>();
  for (const value of values) map.set(value, (map.get(value) ?? 0) + 1);
  return [...map.entries()];
}

export async function adminStats() {
  const [teacherRows, classRows, sessionRows, bookingRows, orderRows, userRows, leadRows, packSales, membershipSales] = await Promise.all([
    db.select().from(teachers),
    db.select().from(classes),
    db.select().from(sessions),
    db.select().from(bookings),
    db.select().from(orders),
    db.select().from(user),
    db.select().from(leads),
    db.select().from(packPurchases),
    db.select().from(membershipSubscriptions),
  ]);
  const paid = orderRows.filter((order) => order.status === "paid" || order.status === "pay_at_studio");
  return {
    teachers: {
      pending: teacherRows.filter((row) => row.status === "pending").length,
      approved: teacherRows.filter((row) => row.status === "approved").length,
      rejected: teacherRows.filter((row) => row.status === "rejected").length,
    },
    classes: classRows.length,
    sessions: sessionRows.length,
    bookings: bookingRows.filter((row) => row.status === "confirmed").length,
    gross: paid.reduce((sum, order) => sum + order.studentPaysCents, 0),
    fees: paid.reduce((sum, order) => sum + order.platformFeeCents, 0),
    liability: paid.reduce((sum, order) => sum + order.platformLiabilityCents, 0),
    signups: userRows.length,
    packSales: packSales.length,
    membershipSales: membershipSales.length,
    leadsByStatus: groupCount(leadRows.map((lead) => lead.outreachStatus)),
    leadsByCity: groupCount(leadRows.map((lead) => lead.city || "Unknown")),
  };
}

export async function listLeads(filters: { q?: string; city?: string; category?: string; status?: string; priority?: string; rep?: string }) {
  const rows = await db.select().from(leads).orderBy(desc(leads.updatedAt));
  return rows.filter((lead) => {
    if (filters.city && lead.city !== filters.city) return false;
    if (filters.category && lead.category !== filters.category) return false;
    if (filters.status && lead.outreachStatus !== filters.status) return false;
    if (filters.priority && lead.priority !== filters.priority) return false;
    if (filters.rep && lead.assignedUserId !== filters.rep) return false;
    if (filters.q) {
      const hay = `${lead.businessName} ${lead.contactName} ${lead.email} ${lead.neighborhood}`.toLowerCase();
      if (!hay.includes(filters.q.toLowerCase())) return false;
    }
    return true;
  });
}

export async function myBookings(userId: string) {
  const rows = await db
    .select({ booking: bookings, klass: classes, order: orders })
    .from(bookings)
    .innerJoin(classes, eq(classes.id, bookings.classId))
    .leftJoin(orders, eq(orders.id, bookings.orderId))
    .where(eq(bookings.userId, userId))
    .orderBy(desc(bookings.createdAt));
  const packsOwned = await db.select({ purchase: packPurchases, pack: packs }).from(packPurchases).innerJoin(packs, eq(packs.id, packPurchases.packId)).where(eq(packPurchases.userId, userId));
  const subs = await db.select({ sub: membershipSubscriptions, plan: memberships }).from(membershipSubscriptions).innerJoin(memberships, eq(memberships.id, membershipSubscriptions.membershipId)).where(eq(membershipSubscriptions.userId, userId));
  const ledger = await db.select().from(creditLedger).where(eq(creditLedger.userId, userId)).orderBy(desc(creditLedger.createdAt)).limit(12);
  const visits = await db
    .select({ visit: visitBookings, service: services, order: orders })
    .from(visitBookings)
    .innerJoin(services, eq(services.id, visitBookings.serviceId))
    .leftJoin(orders, eq(orders.id, visitBookings.orderId))
    .where(eq(visitBookings.userId, userId))
    .orderBy(desc(visitBookings.startsAt));
  return { rows, packsOwned, subs, ledger, visits };
}

export async function billing(teacherId: string) {
  const orderRows = await db.select().from(orders).where(eq(orders.teacherId, teacherId)).orderBy(desc(orders.createdAt));
  const payoutRows = await db.select().from(payouts).where(eq(payouts.teacherId, teacherId));
  const online = orderRows.filter((order) => order.status === "paid" && order.paymentPath === "cash");
  const owed = online.reduce((sum, order) => sum + order.teacherAmountCents, 0) - payoutRows.filter((row) => row.status === "paid").reduce((sum, row) => sum + row.amountCents, 0);
  return { orderRows, payoutRows, owed };
}

export async function listUsers() {
  const people = await db.select().from(user).orderBy(asc(user.name));
  const roles = await db.select().from(userRoles);
  return people.map((person) => ({ ...person, roles: roles.filter((role) => role.userId === person.id).map((role) => role.role) }));
}

export async function recordClick(input: { teacherId: string; targetType: string; targetId?: string; path: string; code?: string; ref?: string; utmSource?: string; utmMedium?: string; utmCampaign?: string; isDemo?: boolean }) {
  await db.insert(linkClicks).values({ id: crypto.randomUUID(), ...input });
}

export async function walletForClass(userId: string, teacherId: string) {
  const [ownedPacks, subs] = await Promise.all([
    db.select({ purchase: packPurchases, pack: packs }).from(packPurchases).innerJoin(packs, eq(packs.id, packPurchases.packId)).where(and(eq(packPurchases.userId, userId), eq(packPurchases.teacherId, teacherId))),
    db.select({ sub: membershipSubscriptions, plan: memberships }).from(membershipSubscriptions).innerJoin(memberships, eq(memberships.id, membershipSubscriptions.membershipId)).where(and(eq(membershipSubscriptions.userId, userId), eq(membershipSubscriptions.teacherId, teacherId), eq(membershipSubscriptions.status, "active"))),
  ]);
  return { ownedPacks, subs };
}
