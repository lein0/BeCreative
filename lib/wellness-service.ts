import { and, eq, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import {
  availabilityWindows,
  categories,
  credentials,
  creditLedger,
  locations,
  studioCredits,
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
  quoteWithStudioCredit,
  validatePromo,
  type PromoRule,
} from "@/lib/pricing";
import { checkoutMustReleaseSeat, collectsOnline, orderMoney, parseAttributionCookie } from "@/lib/checkout-rules";
import { studioCanSell } from "@/lib/review-rules";
import { abandonFailedCheckout, releaseExpiredCheckoutHolds } from "@/lib/booking-service";
import { applyStudioCredit, studioCreditLedgerSource } from "@/lib/refund-math";
import { createCheckout, stripeConfigured } from "@/lib/stripe";
import {
  appointmentConflicts,
  canTakeSeat,
  generateOpenSlots,
  needsWaiver,
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
  const visits = await db.select().from(visitBookings).where(and(eq(visitBookings.serviceId, serviceId), eq(visitBookings.status, "confirmed")));
  const duration = service.kind === "access" ? service.slotMinutes ?? 60 : 60;
  const buffer = service.kind === "access" ? 0 : service.bufferMinutes;
  if (service.kind === "appointment") {
    const options = await db.select().from(serviceOptions).where(eq(serviceOptions.serviceId, serviceId));
    const byOption = options.map((option) => ({
      optionId: option.id,
      minutes: option.minutes,
      priceCents: option.priceCents,
      label: option.label,
      slots: generateOpenSlots({
        windows: windows.map((window) => ({ weekday: window.weekday, start: window.startTime, end: window.endTime })),
        durationMinutes: option.minutes,
        bufferMinutes: buffer,
        from,
        days,
        now: new Date(),
        leadTimeHours: service.leadTimeHours,
        busy: visits.map((visit) => ({ startsAt: visit.startsAt, endsAt: visit.endsAt })),
      }),
    }));
    return { kind: "appointment" as const, options: byOption };
  }
  const slots = generateOpenSlots({
    windows: windows.map((window) => ({ weekday: window.weekday, start: window.startTime, end: window.endTime })),
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
  policyAccepted?: boolean;
  ip?: string | null;
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
    busy: service.kind === "appointment"
      ? (await db.select().from(visitBookings).where(and(eq(visitBookings.serviceId, service.id), eq(visitBookings.status, "confirmed")))).map((visit) => ({ startsAt: visit.startsAt, endsAt: visit.endsAt }))
      : [],
  });
  if (!offered.some((slot) => slot.startsAt.getTime() === startsAt.getTime())) return { error: "That time is not open." };

  const listPrice = (service.kind === "access" ? service.priceCents : option?.priceCents ?? 0) + chosenAddons.reduce((sum, addon) => sum + addon.priceCents, 0);
  const fee = await fees();
  const { attr, extraCode } = await requestContext();
  const normalized = normalizeCodes([input.code ?? "", extraCode]);
  if (normalized.error) return { error: normalized.error };
  await releaseExpiredCheckoutHolds();

  try {
    const created = await db.transaction(async (tx) => {
      await tx.execute(sql`select id from services where id = ${service.id} for update`);
      const busyRows = await tx.select().from(visitBookings).where(and(eq(visitBookings.serviceId, service.id), eq(visitBookings.status, "confirmed")));
      const busy: BusyRange[] = busyRows.map((row) => ({ startsAt: row.startsAt, endsAt: row.endsAt }));
      if (service.kind === "appointment" && appointmentConflicts({ startsAt, endsAt: visitEnd }, busy, service.bufferMinutes)) {
        throw new Error("That time was just taken.");
      }
      if (service.kind === "access") {
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

      let studioCreditCents = 0;
      if (payWith === "credit" && listPrice > 0) {
        const [credit] = await tx.select().from(studioCredits).where(and(eq(studioCredits.userId, input.userId), eq(studioCredits.teacherId, teacher.id))).limit(1);
        const spend = applyStudioCredit({ balanceCents: credit?.balanceCents ?? 0, priceCents: listPrice });
        if (spend.appliedCents <= 0 || !credit) throw new Error("You don't have studio credit with this teacher.");
        const spent = await tx
          .update(studioCredits)
          .set({ balanceCents: sql`${studioCredits.balanceCents} - ${spend.appliedCents}` })
          .where(and(eq(studioCredits.id, credit.id), sql`${studioCredits.balanceCents} >= ${spend.appliedCents}`))
          .returning();
        if (!spent.length) throw new Error("You don't have enough studio credit for this class.");
        studioCreditCents = spend.appliedCents;
      }

      let promoRow: typeof promoCodes.$inferSelect | null = null;
      const promoBase = Math.max(0, listPrice - studioCreditCents);
      if (normalized.code && !entitlement && promoBase > 0) {
        const [found] = await tx.select().from(promoCodes).where(eq(promoCodes.code, normalized.code)).limit(1);
        if (!found) throw new Error("That code is not recognized.");
        const [totals] = await tx.select({ count: sql<number>`count(*)::int` }).from(promoRedemptions).where(and(eq(promoRedemptions.promoCodeId, found.id), eq(promoRedemptions.reversed, false)));
        const [mine] = await tx.select({ count: sql<number>`count(*)::int` }).from(promoRedemptions).where(and(eq(promoRedemptions.promoCodeId, found.id), eq(promoRedemptions.userId, input.userId), eq(promoRedemptions.reversed, false)));
        const [prior] = await tx.select({ count: sql<number>`count(*)::int` }).from(orders).where(and(eq(orders.userId, input.userId), sql`${orders.status} in ('paid', 'pay_at_studio')`));
        const verdict = validatePromo({
          promo: toRule(found),
          now: new Date(),
          listPriceCents: promoBase,
          totalRedemptions: Number(totals?.count ?? 0),
          customerRedemptions: Number(mine?.count ?? 0),
          isFirstTimeStudent: Number(prior?.count ?? 0) === 0,
          product: { kind: "class", teacherId: teacher.id, categoryId: service.categoryId, city: "Los Angeles" },
        });
        if (!verdict.ok) throw new Error(verdict.reason);
        promoRow = found;
      }
      const quote = studioCreditCents > 0
        ? quoteWithStudioCredit({
            listPriceCents: listPrice,
            appliedCents: studioCreditCents,
            feePercent: fee.feePercent,
            feeFixedCents: fee.feeFixedCents,
            promo: promoRow ? toRule(promoRow) : null,
          })
        : quotePrice({
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
          discountCents: Math.max(0, quote.discountCents - studioCreditCents),
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
      if (studioCreditCents > 0) {
        await tx.insert(creditLedger).values({
          id: crypto.randomUUID(),
          userId: input.userId,
          teacherId: teacher.id,
          sourceType: "studio_credit",
          sourceId: studioCreditLedgerSource(orderId, studioCreditCents),
          direction: "consume",
        });
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

    if (input.policyAccepted) {
      const [settings] = await db.select().from(platformSettings).limit(1);
      const { policySummary, SHIP_DEFAULTS } = await import("@/lib/ship-defaults");
      const { policyAcceptances } = await import("@/lib/db/schema");
      await db.insert(policyAcceptances).values({
        id: crypto.randomUUID(),
        userId: input.userId,
        orderId: created.orderId,
        policyVersion: settings?.policyVersion ?? SHIP_DEFAULTS.policyVersion,
        policyText: policySummary({
          fullRefundHours: settings?.studentFullRefundHours ?? SHIP_DEFAULTS.studentFullRefundHours,
          creditOnlyHours: settings?.studentCreditOnlyHours ?? SHIP_DEFAULTS.studentCreditOnlyHours,
          lateCancelFeeCents: settings?.lateCancelFeeCents ?? 0,
          noShowFeeCents: settings?.noShowFeeCents ?? 0,
        }),
        ip: input.ip,
      });
    }
    if (created.status === "pending") {
      const { cardPaymentsReady, statementDescriptor } = await import("@/lib/connect-rules");
      const { SHIP_DEFAULTS } = await import("@/lib/ship-defaults");
      const ready = cardPaymentsReady({ stripeOn: stripeConfigured(), chargesEnabled: Boolean(teacher.stripeChargesEnabled) });
      if (!ready.ok && checkoutMustReleaseSeat({ paymentsReady: ready.ok, orderPending: true })) {
        await abandonFailedCheckout(created.orderId);
        return { error: ready.reason };
      }
      try {
        const session = await createCheckout({
          name: created.title,
          amountCents: created.quote.studentPaysCents,
          applicationFeeCents: created.quote.platformFeeCents,
          destinationAccountId: teacher.stripeAccountId,
          customerEmail: input.email,
          successPath: "/bookings?reserved=1",
          cancelPath: `/s/${service.slug}?cancelled=1`,
          metadata: { type: "order", orderId: created.orderId, userId: input.userId },
          statementDescriptor: statementDescriptor(teacher.studioName || "Studio", SHIP_DEFAULTS.statementDescriptorPrefix),
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
      await db.update(orders).set({ status: "pay_at_studio", platformFeeCents: offline.platformFeeCents, teacherAmountCents: offline.teacherAmountCents, platformLiabilityCents: offline.platformLiabilityCents }).where(eq(orders.id, created.orderId));
    }
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
    await db.insert(locations).values({
      id: locationId,
      name: input.location.name,
      addressLine1: input.location.address,
      city: input.location.city || "Los Angeles",
      state: "CA",
      postalCode: "90026",
      neighborhood: input.location.neighborhood || "Silver Lake",
      lat: 34.0869,
      lng: -118.2702,
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
  const { studentCancelVisit } = await import("@/lib/cancellations");
  return studentCancelVisit(userId, visitId);
}
