import { and, eq, ne, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import {
  availabilityWindows,
  categories,
  credentials,
  creditLedger,
  locations,
  memberships,
  membershipSubscriptions,
  orders,
  packPurchases,
  packs,
  platformSettings,
  promoCodes,
  promoRedemptions,
  serviceAddons,
  serviceOptions,
  services,
  teachers,
  user,
  visitBookings,
  waiverSignatures,
  waivers,
} from "@/lib/db/schema";
import {
  canSpendMembership,
  canSpendPack,
  normalizeCodes,
  offerCoversClass,
  quotePrice,
  validatePromo,
  type PromoRule,
} from "@/lib/pricing";
import { collectsOnline, orderMoney, parseAttributionCookie } from "@/lib/checkout-rules";
import { studioCanSell } from "@/lib/review-rules";
import { abandonFailedCheckout, priorWithTeacher, releaseExpiredCheckoutHolds, releaseVisitSeat } from "@/lib/booking-service";
import { sendEmail } from "@/lib/email";
import { coordinatesForVisit } from "@/lib/geocode";
import { createCheckout, getStripe, stripeConfigured } from "@/lib/stripe";
import {
  appointmentConflicts,
  canTakeSeat,
  generateOpenSlots,
  needsWaiver,
  withinCancellationWindow,
  type BusyRange,
} from "@/lib/slots";
import { uniqueSlug } from "@/lib/utils";

function toRule(row: typeof promoCodes.$inferSelect): PromoRule {
  return {
    code: row.code,
    active: row.active,
    discountType: row.discountType as PromoRule["discountType"],
    percentOffBps: row.percentOffBps,
    amountOffCents: row.amountOffCents,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    maxRedemptions: row.maxRedemptions,
    maxPerCustomer: row.maxPerCustomer,
    firstTimeOnly: row.firstTimeOnly,
    minPurchaseCents: row.minPurchaseCents,
    funding: row.funding as PromoRule["funding"],
    platformSharePercent: row.platformSharePercent,
    appliesTo: row.appliesTo as PromoRule["appliesTo"],
    teacherId: row.teacherId,
    classIds: row.classIds,
    categoryIds: row.categoryIds,
    packIds: row.packIds,
    membershipIds: row.membershipIds,
    cities: row.cities,
  };
}

async function fees() {
  const [row] = await db.select().from(platformSettings).limit(1);
  return { feePercent: row?.feePercent ?? 10, feeFixedCents: row?.feeFixedCents ?? 0 };
}

async function confirmedAppointmentRanges(teacherId: string, database: Pick<typeof db, "select"> = db) {
  const rows = await database
    .select({ startsAt: visitBookings.startsAt, endsAt: visitBookings.endsAt })
    .from(visitBookings)
    .innerJoin(services, eq(services.id, visitBookings.serviceId))
    .where(and(eq(services.teacherId, teacherId), eq(services.kind, "appointment"), eq(visitBookings.status, "confirmed")));
  return rows.map((row) => ({ startsAt: row.startsAt, endsAt: row.endsAt }));
}

async function requestContext() {
  try {
    const jar = await cookies();
    return {
      attr: parseAttributionCookie(jar.get("bc_attr")?.value),
      extraCode: jar.get("bc_code")?.value ?? "",
    };
  } catch {
    return { attr: parseAttributionCookie(null), extraCode: "" };
  }
}

export async function serviceDetail(slug: string) {
  const [service] = await db.select().from(services).where(eq(services.slug, slug)).limit(1);
  if (!service || service.status !== "published") return null;
  const [teacher] = await db.select().from(teachers).where(eq(teachers.id, service.teacherId)).limit(1);
  if (!teacher || !studioCanSell(teacher.status)) return null;
  const [options, addons, windows, location, category, creds, waiver] = await Promise.all([
    db.select().from(serviceOptions).where(eq(serviceOptions.serviceId, service.id)),
    db.select().from(serviceAddons).where(eq(serviceAddons.serviceId, service.id)),
    db.select().from(availabilityWindows).where(eq(availabilityWindows.serviceId, service.id)),
    service.locationId ? db.select().from(locations).where(eq(locations.id, service.locationId)).limit(1) : Promise.resolve([]),
    db.select().from(categories).where(eq(categories.id, service.categoryId)).limit(1),
    db.select().from(credentials).where(eq(credentials.teacherId, teacher.id)),
    db.select().from(waivers).where(eq(waivers.teacherId, teacher.id)).limit(1),
  ]);
  return { service, teacher, options, addons, windows, location: location[0] ?? null, category: category[0] ?? null, credentials: creds, waiver: waiver[0] ?? null };
}

export async function openSlotsForService(serviceId: string, from = new Date(), days = 14) {
  const [service] = await db.select().from(services).where(eq(services.id, serviceId)).limit(1);
  if (!service) return { kind: "access" as const, slots: [] };
  const windows = await db.select().from(availabilityWindows).where(eq(availabilityWindows.serviceId, serviceId));
  const windowInput = windows.map((window) => ({ weekday: window.weekday, start: window.startTime, end: window.endTime }));
  const buffer = service.kind === "access" ? 0 : service.bufferMinutes;
  if (service.kind === "appointment") {
    const [options, busy] = await Promise.all([
      db.select().from(serviceOptions).where(eq(serviceOptions.serviceId, serviceId)),
      confirmedAppointmentRanges(service.teacherId),
    ]);
    const byOption = options.map((option) => ({
      optionId: option.id,
      minutes: option.minutes,
      priceCents: option.priceCents,
      label: option.label,
      slots: generateOpenSlots({
        windows: windowInput,
        durationMinutes: option.minutes,
        bufferMinutes: buffer,
        from,
        days,
        now: new Date(),
        leadTimeHours: service.leadTimeHours,
        busy,
      }),
    }));
    return { kind: "appointment" as const, options: byOption };
  }
  const visits = await db.select().from(visitBookings).where(and(eq(visitBookings.serviceId, serviceId), eq(visitBookings.status, "confirmed")));
  const duration = service.slotMinutes ?? 60;
  const slots = generateOpenSlots({
    windows: windowInput,
    durationMinutes: duration,
    bufferMinutes: 0,
    from,
    days,
    now: new Date(),
    leadTimeHours: service.leadTimeHours,
    busy: [],
  });
  const taken = new Map<string, number>();
  for (const visit of visits) taken.set(visit.startsAt.toISOString(), (taken.get(visit.startsAt.toISOString()) ?? 0) + 1);
  return {
    kind: "access" as const,
    slots: slots
      .map((slot) => ({ ...slot, left: Math.max(0, service.capacity - (taken.get(slot.startsAt.toISOString()) ?? 0)) }))
      .filter((slot) => slot.left > 0),
  };
}

export async function signedWaiverVersion(teacherId: string, userId: string) {
  const rows = await db.select().from(waiverSignatures).where(and(eq(waiverSignatures.teacherId, teacherId), eq(waiverSignatures.userId, userId)));
  return rows.reduce((max, row) => Math.max(max, row.version), 0) || null;
}

export async function signWaiver(input: { teacherId: string; userId: string; signedName: string; ip: string | null }) {
  const name = input.signedName.trim();
  if (name.length < 2) return { error: "Type your name to sign." };
  const [waiver] = await db.select().from(waivers).where(eq(waivers.teacherId, input.teacherId)).limit(1);
  if (!waiver) return { error: "This studio has no waiver." };
  const id = crypto.randomUUID();
  await db.insert(waiverSignatures).values({
    id,
    waiverId: waiver.id,
    teacherId: input.teacherId,
    userId: input.userId,
    version: waiver.version,
    signedName: name,
    ip: input.ip,
  }).onConflictDoNothing();
  return { ok: true, version: waiver.version };
}

export async function bookVisit(input: {
  userId: string;
  email: string;
  serviceId: string;
  optionId?: string;
  addonIds?: string[];
  startsAt: string;
  code?: string;
  payWith?: string;
}) {
  const detail = await db.select().from(services).where(eq(services.id, input.serviceId)).limit(1);
  const service = detail[0];
  if (!service || service.status !== "published") return { error: "That offering is not open." };
  const [teacher] = await db.select().from(teachers).where(eq(teachers.id, service.teacherId)).limit(1);
  if (!teacher || !studioCanSell(teacher.status)) return { error: "This practitioner is not bookable yet." };
  const startsAt = new Date(input.startsAt);
  if (Number.isNaN(startsAt.getTime())) return { error: "Pick a time." };
  const options = await db.select().from(serviceOptions).where(eq(serviceOptions.serviceId, service.id));
  const option = options.find((item) => item.id === input.optionId) ?? null;
  const duration = service.kind === "access" ? service.slotMinutes ?? 60 : option?.minutes;
  if (!duration) return { error: "Choose a session length." };
  const endsAt = new Date(startsAt.getTime() + duration * 60_000);
  const addons = input.addonIds?.length
    ? await db.select().from(serviceAddons).where(eq(serviceAddons.serviceId, service.id))
    : [];
  const chosenAddons = addons.filter((addon) => input.addonIds?.includes(addon.id));
  const addonMinutes = chosenAddons.reduce((sum, addon) => sum + addon.minutes, 0);
  const visitEnd = new Date(endsAt.getTime() + addonMinutes * 60_000);
  const [waiver] = await db.select().from(waivers).where(eq(waivers.teacherId, teacher.id)).limit(1);
  const signed = await signedWaiverVersion(teacher.id, input.userId);
  if (service.waiverRequired && !waiver) return { error: "This studio requires a waiver before booking." };
  if (needsWaiver({ required: service.waiverRequired, currentVersion: waiver?.version ?? null, signedVersion: signed })) {
    return { error: "Sign the studio waiver before booking." };
  }
  const windows = await db.select().from(availabilityWindows).where(eq(availabilityWindows.serviceId, service.id));
  const offered = generateOpenSlots({
    windows: windows.map((window) => ({ weekday: window.weekday, start: window.startTime, end: window.endTime })),
    durationMinutes: duration,
    bufferMinutes: service.kind === "access" ? 0 : service.bufferMinutes,
    from: startsAt,
    days: 1,
    now: new Date(),
    leadTimeHours: service.leadTimeHours,
    busy: service.kind === "appointment" ? await confirmedAppointmentRanges(teacher.id) : [],
  });
  const chosen = offered.find((slot) => slot.startsAt.getTime() === startsAt.getTime());
  if (!chosen || addonMinutes > chosen.slackMinutes) return { error: "That time is not open." };

  const listPrice = (service.kind === "access" ? service.priceCents : option?.priceCents ?? 0) + chosenAddons.reduce((sum, addon) => sum + addon.priceCents, 0);
  const fee = await fees();
  const { attr, extraCode } = await requestContext();
  const normalized = normalizeCodes([input.code ?? "", extraCode]);
  if (normalized.error) return { error: normalized.error };
  await releaseExpiredCheckoutHolds();

  try {
    const created = await db.transaction(async (tx) => {
      if (service.kind === "appointment") {
        await tx.execute(sql`select id from teachers where id = ${teacher.id} for update`);
        const busy: BusyRange[] = await confirmedAppointmentRanges(teacher.id, tx);
        if (appointmentConflicts({ startsAt, endsAt: visitEnd }, busy, service.bufferMinutes)) {
          throw new Error("That time was just taken.");
        }
      }
      if (service.kind === "access") {
        await tx.execute(sql`select id from services where id = ${service.id} for update`);
        const busyRows = await tx.select().from(visitBookings).where(and(eq(visitBookings.serviceId, service.id), eq(visitBookings.status, "confirmed")));
        const slotId = crypto.randomUUID();
        await tx.execute(sql`
          insert into access_slots (id, service_id, starts_at, capacity)
          values (${slotId}, ${service.id}, ${startsAt}, ${service.capacity})
          on conflict (service_id, starts_at) do nothing
        `);
        await tx.execute(sql`select id from access_slots where service_id = ${service.id} and starts_at = ${startsAt} for update`);
        const taken = busyRows.filter((row) => row.startsAt.getTime() === startsAt.getTime()).length;
        if (!canTakeSeat(service.capacity, taken)) throw new Error("That slot is full.");
      }

      const payWith = input.payWith ?? "cash";
      let entitlement = false;
      let packPurchaseId: string | null = null;
      let membershipSubscriptionId: string | null = null;
      if (payWith.startsWith("pack:")) {
        const [purchase] = await tx.select().from(packPurchases).where(and(eq(packPurchases.id, payWith.slice(5)), eq(packPurchases.userId, input.userId))).limit(1);
        if (!purchase) throw new Error("That pack is not in your wallet.");
        const [pack] = await tx.select().from(packs).where(eq(packs.id, purchase.packId)).limit(1);
        const covers = offerCoversClass({ classIds: pack?.classIds ?? [], categoryIds: pack?.categoryIds ?? [] }, service.id, service.categoryId);
        const check = canSpendPack({ creditsRemaining: purchase.creditsRemaining, expiresAt: purchase.expiresAt, now: new Date(), covers });
        if (!check.ok) throw new Error(check.reason);
        await tx.update(packPurchases).set({ creditsRemaining: purchase.creditsRemaining - 1 }).where(eq(packPurchases.id, purchase.id));
        entitlement = true;
        packPurchaseId = purchase.id;
      } else if (payWith.startsWith("membership:")) {
        const [sub] = await tx.select().from(membershipSubscriptions).where(eq(membershipSubscriptions.id, payWith.slice(11))).limit(1);
        if (!sub || sub.userId !== input.userId) throw new Error("That membership is not active.");
        const [plan] = await tx.select().from(memberships).where(eq(memberships.id, sub.membershipId)).limit(1);
        const covers = offerCoversClass({ classIds: plan?.classIds ?? [], categoryIds: plan?.categoryIds ?? [] }, service.id, service.categoryId);
        const check = canSpendMembership({
          status: sub.status,
          periodEnd: sub.currentPeriodEnd,
          now: new Date(),
          unlimited: sub.unlimited,
          classesPerPeriod: sub.classesPerPeriod,
          classesUsed: sub.classesUsedThisPeriod,
          covers,
        });
        if (!check.ok) throw new Error(check.reason);
        await tx.update(membershipSubscriptions).set({ classesUsedThisPeriod: sub.classesUsedThisPeriod + 1 }).where(eq(membershipSubscriptions.id, sub.id));
        entitlement = true;
        membershipSubscriptionId = sub.id;
      }

      let promoRow: typeof promoCodes.$inferSelect | null = null;
      if (normalized.code && !entitlement && listPrice > 0) {
        const [found] = await tx.select().from(promoCodes).where(eq(promoCodes.code, normalized.code)).limit(1);
        if (!found) throw new Error("That code is not recognized.");
        const [totals] = await tx.select({ count: sql<number>`count(*)::int` }).from(promoRedemptions).where(and(eq(promoRedemptions.promoCodeId, found.id), eq(promoRedemptions.reversed, false)));
        const [mine] = await tx.select({ count: sql<number>`count(*)::int` }).from(promoRedemptions).where(and(eq(promoRedemptions.promoCodeId, found.id), eq(promoRedemptions.userId, input.userId), eq(promoRedemptions.reversed, false)));
        const verdict = validatePromo({
          promo: toRule(found),
          now: new Date(),
          listPriceCents: listPrice,
          totalRedemptions: Number(totals?.count ?? 0),
          customerRedemptions: Number(mine?.count ?? 0),
          isFirstTimeStudent: !(await priorWithTeacher(input.userId, teacher.id)),
          product: { kind: "class", teacherId: teacher.id, categoryId: service.categoryId, city: "Los Angeles" },
        });
        if (!verdict.ok) throw new Error(verdict.reason);
        promoRow = found;
      }
      const quote = quotePrice({
        listPriceCents: listPrice,
        feePercent: fee.feePercent,
        feeFixedCents: fee.feeFixedCents,
        promo: promoRow ? toRule(promoRow) : null,
        entitlement,
      });
      const online = collectsOnline(quote.studentPaysCents, stripeConfigured());
      const money = orderMoney(quote, online);
      const status = quote.studentPaysCents === 0 ? "paid" : online ? "pending" : "pay_at_studio";
      const orderId = crypto.randomUUID();
      const visitId = crypto.randomUUID();
      await tx.insert(orders).values({
        id: orderId,
        userId: input.userId,
        teacherId: teacher.id,
        kind: "visit",
        status,
        listPriceCents: quote.listPriceCents,
        discountCents: quote.discountCents,
        studentPaysCents: quote.studentPaysCents,
        platformFeeCents: money.platformFeeCents,
        teacherAmountCents: money.teacherAmountCents,
        platformFundedCents: quote.platformFundedCents,
        teacherFundedCents: quote.teacherFundedCents,
        platformLiabilityCents: money.platformLiabilityCents,
        promoCodeId: promoRow?.id,
        paymentPath: quote.paymentPath,
        ref: attr.ref,
        utmSource: attr.utmSource,
        utmMedium: attr.utmMedium,
        utmCampaign: attr.utmCampaign,
      });
      if (promoRow) {
        await tx.insert(promoRedemptions).values({
          id: crypto.randomUUID(),
          promoCodeId: promoRow.id,
          userId: input.userId,
          orderId,
          discountCents: quote.discountCents,
          platformFundedCents: quote.platformFundedCents,
          teacherFundedCents: quote.teacherFundedCents,
        });
      }
      if (packPurchaseId) {
        await tx.insert(creditLedger).values({ id: crypto.randomUUID(), userId: input.userId, teacherId: teacher.id, sourceType: "pack", sourceId: packPurchaseId, direction: "consume" });
      }
      if (membershipSubscriptionId) {
        await tx.insert(creditLedger).values({ id: crypto.randomUUID(), userId: input.userId, teacherId: teacher.id, sourceType: "membership", sourceId: membershipSubscriptionId, direction: "consume" });
      }
      const [signature] = waiver
        ? await tx.select().from(waiverSignatures).where(and(eq(waiverSignatures.teacherId, teacher.id), eq(waiverSignatures.userId, input.userId), eq(waiverSignatures.version, waiver.version))).limit(1)
        : [];
      await tx.insert(visitBookings).values({
        id: visitId,
        orderId,
        userId: input.userId,
        serviceId: service.id,
        optionId: option?.id,
        offeringKind: service.kind,
        startsAt,
        endsAt: visitEnd,
        addonIds: chosenAddons.map((addon) => addon.id),
        packPurchaseId,
        membershipSubscriptionId,
        waiverSignatureId: signature?.id,
      });
      return { orderId, visitId, quote, status, title: service.title };
    });

    let status = created.status;
    if (created.status === "pending") {
      try {
        const session = await createCheckout({
          name: created.title,
          amountCents: created.quote.studentPaysCents,
          applicationFeeCents: created.quote.platformFeeCents,
          destinationAccountId: teacher.stripeAccountId,
          customerEmail: input.email,
          successPath: "/bookings?reserved=1",
          cancelPath: `/s/${service.slug}?cancelled=1`,
          metadata: { type: "order", orderId: created.orderId },
        });
        if (session?.url) {
          await db.update(orders).set({ stripeCheckoutSessionId: session.id }).where(eq(orders.id, created.orderId));
          return { checkoutUrl: session.url, orderId: created.orderId };
        }
      } catch (error) {
        await abandonFailedCheckout(created.orderId);
        return { error: error instanceof Error ? error.message : "Could not book." };
      }
      const offline = orderMoney(created.quote, false);
      status = "pay_at_studio";
      await db.update(orders).set({ status, platformFeeCents: offline.platformFeeCents, teacherAmountCents: offline.teacherAmountCents, platformLiabilityCents: offline.platformLiabilityCents }).where(eq(orders.id, created.orderId));
    }
    await sendEmail({
      to: [input.email],
      subject: `You're booked: ${created.title}`,
      text: `Your spot is reserved${status === "pay_at_studio" ? ". Pay the teacher at the studio." : "."}`,
      teacherId: teacher.id,
    });
    return { orderId: created.orderId };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not book." };
  }
}

export async function saveService(input: {
  teacherId: string;
  title: string;
  description: string;
  categoryId: string;
  kind: "appointment" | "access";
  bufferMinutes: number;
  leadTimeHours: number;
  cancellationHours: number;
  slotMinutes: number | null;
  capacity: number;
  priceCents: number;
  waiverRequired: boolean;
  publish: boolean;
  windows: { weekday: number; start: string; end: string }[];
  options: { label: string; minutes: number; priceCents: number }[];
  addons: { name: string; priceCents: number; minutes: number }[];
  location?: { name: string; address: string; neighborhood: string; city: string };
}) {
  const id = crypto.randomUUID();
  let locationId: string | null = null;
  if (input.location?.address) {
    locationId = crypto.randomUUID();
    const point = await coordinatesForVisit({
      address: input.location.address,
      neighborhood: input.location.neighborhood,
      city: input.location.city,
    });
    await db.insert(locations).values({
      id: locationId,
      name: input.location.name,
      addressLine1: input.location.address,
      city: input.location.city || "Los Angeles",
      state: "CA",
      postalCode: "90026",
      neighborhood: input.location.neighborhood || "Silver Lake",
      lat: point.lat,
      lng: point.lng,
    });
  }
  await db.insert(services).values({
    id,
    teacherId: input.teacherId,
    categoryId: input.categoryId,
    locationId,
    slug: uniqueSlug(input.title),
    title: input.title,
    description: input.description,
    kind: input.kind,
    bufferMinutes: input.bufferMinutes,
    leadTimeHours: input.leadTimeHours,
    cancellationHours: input.cancellationHours,
    slotMinutes: input.slotMinutes,
    capacity: input.kind === "access" ? input.capacity : 1,
    priceCents: input.priceCents,
    waiverRequired: input.waiverRequired,
    status: input.publish ? "published" : "draft",
  });
  for (const [index, option] of input.options.entries()) {
    await db.insert(serviceOptions).values({ id: crypto.randomUUID(), serviceId: id, label: option.label, minutes: option.minutes, priceCents: option.priceCents, sortOrder: index });
  }
  for (const addon of input.addons) {
    if (!addon.name) continue;
    await db.insert(serviceAddons).values({ id: crypto.randomUUID(), serviceId: id, name: addon.name, priceCents: addon.priceCents, minutes: addon.minutes });
  }
  for (const window of input.windows) {
    await db.insert(availabilityWindows).values({ id: crypto.randomUUID(), serviceId: id, weekday: window.weekday, startTime: window.start, endTime: window.end });
  }
  return { id };
}

export async function saveWaiver(teacherId: string, body: string) {
  const text = body.trim();
  if (text.length < 20) return { error: "Write the waiver students will sign." };
  const [existing] = await db.select().from(waivers).where(eq(waivers.teacherId, teacherId)).limit(1);
  if (!existing) {
    await db.insert(waivers).values({ id: crypto.randomUUID(), teacherId, body: text, version: 1 });
    return { ok: true, version: 1 };
  }
  const version = existing.version + 1;
  await db.update(waivers).set({ body: text, version, updatedAt: new Date() }).where(eq(waivers.id, existing.id));
  return { ok: true, version };
}

export async function saveCredential(input: { teacherId: string; label: string; identifier: string }) {
  if (!input.label.trim()) return { error: "Name the credential." };
  const id = crypto.randomUUID();
  await db.insert(credentials).values({ id, teacherId: input.teacherId, label: input.label.trim(), identifier: input.identifier.trim() || null });
  return { id };
}

export async function verifyCredential(id: string, verified: boolean, actorId: string) {
  await db.update(credentials).set({ verified, verifiedAt: verified ? new Date() : null, verifiedBy: verified ? actorId : null }).where(eq(credentials.id, id));
}

export async function upcomingVisits(teacherId: string) {
  const rows = await db
    .select({ visit: visitBookings, service: services })
    .from(visitBookings)
    .innerJoin(services, eq(services.id, visitBookings.serviceId))
    .where(and(eq(services.teacherId, teacherId), eq(visitBookings.status, "confirmed")));
  return rows.sort((a, b) => a.visit.startsAt.getTime() - b.visit.startsAt.getTime());
}

export async function visitRoster(serviceId: string) {
  const [service] = await db.select().from(services).where(eq(services.id, serviceId)).limit(1);
  if (!service) return null;
  const visits = await db
    .select({ visit: visitBookings, student: user })
    .from(visitBookings)
    .leftJoin(user, eq(user.id, visitBookings.userId))
    .where(and(eq(visitBookings.serviceId, serviceId), eq(visitBookings.status, "confirmed")));
  const signatures = await db.select().from(waiverSignatures).where(eq(waiverSignatures.teacherId, service.teacherId));
  return { service, visits: visits.sort((a, b) => a.visit.startsAt.getTime() - b.visit.startsAt.getTime()), signatures };
}

export async function cancelVisit(userId: string, visitId: string) {
  const now = new Date();
  const [visit] = await db.select().from(visitBookings).where(and(eq(visitBookings.id, visitId), eq(visitBookings.userId, userId))).limit(1);
  if (!visit || visit.status !== "confirmed") return { error: "Booking not found." };
  const [service] = await db.select().from(services).where(eq(services.id, visit.serviceId)).limit(1);
  if (!service || !withinCancellationWindow(visit.startsAt, now, service.cancellationHours)) return { error: "The cancellation window has closed." };
  await releaseVisitSeat(visit, now);
  if (!visit.orderId) return { ok: true };
  await db.update(promoRedemptions).set({ reversed: true }).where(eq(promoRedemptions.orderId, visit.orderId));
  const [order] = await db.select().from(orders).where(eq(orders.id, visit.orderId)).limit(1);
  if (!order || order.status === "refunded") return { ok: true };
  if (order.status === "paid" && order.studentPaysCents > 0 && order.stripePaymentIntentId) {
    const stripe = getStripe();
    if (stripe) {
      await stripe.refunds.create({ payment_intent: order.stripePaymentIntentId });
      await db.update(orders).set({ status: "refunded" }).where(and(eq(orders.id, order.id), ne(orders.status, "refunded")));
      return { ok: true };
    }
  }
  await db.update(orders).set({ status: "cancelled" }).where(eq(orders.id, order.id));
  return { ok: true };
}
