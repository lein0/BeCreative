import { and, eq, inArray, lte, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { decideBooking, decideSeriesBooking } from "@/lib/booking-rules";
import { db } from "@/lib/db";
import {
  bookingSessions,
  bookings,
  classes,
  creditLedger,
  introRedemptions,
  memberships,
  membershipSubscriptions,
  orders,
  packPurchases,
  packs,
  platformSettings,
  promoCodes,
  promoRedemptions,
  sessions,
  teachers,
  waitlistEntries,
} from "@/lib/db/schema";
import { sendEmail } from "@/lib/email";
import {
  canSpendMembership,
  canSpendPack,
  firstClassFreeEligible,
  normalizeCodes,
  offerCoversClass,
  quotePrice,
  shouldRestoreEntitlement,
  validatePromo,
  type PromoRule,
} from "@/lib/pricing";
import { checkoutHoldCutoff, checkoutHoldMinutes } from "@/lib/holds";
import { createCheckout, getStripe, stripeConfigured } from "@/lib/stripe";

export type ActionState = { error?: string; ok?: string } | null;

async function fees() {
  const [row] = await db.select().from(platformSettings).limit(1);
  if (row) return row;
  await db.insert(platformSettings).values({ id: 1, feePercent: 10, feeFixedCents: 0 });
  return { id: 1, feePercent: 10, feeFixedCents: 0 };
}

async function attribution() {
  const jar = await cookies();
  const raw = jar.get("bc_attr")?.value;
  let ref: string | null = null;
  let utmSource: string | null = null;
  let utmMedium: string | null = null;
  let utmCampaign: string | null = null;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { ref?: string; utmSource?: string; utmMedium?: string; utmCampaign?: string };
      ref = parsed.ref ?? null;
      utmSource = parsed.utmSource ?? null;
      utmMedium = parsed.utmMedium ?? null;
      utmCampaign = parsed.utmCampaign ?? null;
    } catch {
      ref = null;
    }
  }
  return { ref, utmSource, utmMedium, utmCampaign, code: jar.get("bc_code")?.value ?? "" };
}

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

export async function releaseExpiredCheckoutHolds(now = new Date()) {
  const cutoff = checkoutHoldCutoff(now, checkoutHoldMinutes());
  const stale = await db.select().from(orders).where(and(eq(orders.status, "pending"), lte(orders.createdAt, cutoff)));
  const stripe = getStripe();
  let released = 0;
  for (const order of stale) {
    if (stripe && order.stripeCheckoutSessionId) {
      try {
        const session = await stripe.checkout.sessions.retrieve(order.stripeCheckoutSessionId);
        if (session.status === "complete" || session.payment_status === "paid") continue;
        if (session.status === "open") await stripe.checkout.sessions.expire(order.stripeCheckoutSessionId);
      } catch {
        // The Checkout session is already closed. Release the seat anyway.
      }
    }
    const updated = await db
      .update(orders)
      .set({ status: "expired", updatedAt: now })
      .where(and(eq(orders.id, order.id), eq(orders.status, "pending")))
      .returning({ id: orders.id });
    if (!updated.length) continue;
    await db.update(bookings).set({ status: "cancelled", cancelledAt: now }).where(and(eq(bookings.orderId, order.id), eq(bookings.status, "confirmed")));
    await db.update(promoRedemptions).set({ reversed: true }).where(eq(promoRedemptions.orderId, order.id));
    await db.update(membershipSubscriptions).set({ status: "cancelled" }).where(eq(membershipSubscriptions.orderId, order.id));
    released += 1;
  }
  return released;
}

export async function confirmedCount(sessionId: string, tx: typeof db = db) {
  const [row] = await tx
    .select({ count: sql<number>`count(distinct ${bookingSessions.bookingId})::int` })
    .from(bookingSessions)
    .innerJoin(bookings, eq(bookings.id, bookingSessions.bookingId))
    .where(and(eq(bookingSessions.sessionId, sessionId), eq(bookings.status, "confirmed")));
  return Number(row?.count ?? 0);
}

async function priorWithTeacher(userId: string, teacherId: string) {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(bookings)
    .innerJoin(classes, eq(classes.id, bookings.classId))
    .where(and(eq(bookings.userId, userId), eq(classes.teacherId, teacherId), eq(bookings.status, "confirmed")));
  return Number(row?.count ?? 0) > 0;
}

export async function bookSession(input: {
  userId: string;
  email: string;
  name: string;
  sessionId?: string;
  series?: boolean;
  classId?: string;
  code?: string;
  payWith?: string;
}): Promise<{ error?: string; checkoutUrl?: string; orderId?: string }> {
  const attr = await attribution();
  const codeInput = normalizeCodes([input.code ?? "", attr.code]);
  if (codeInput.error) return { error: codeInput.error };
  const fee = await fees();
  const now = new Date();
  await releaseExpiredCheckoutHolds(now);

  try {
    const created = await db.transaction(async (tx) => {
      let targetSessions: (typeof sessions.$inferSelect)[] = [];
      if (input.series) {
        if (!input.classId) throw new Error("Choose a class.");
        targetSessions = await tx.select().from(sessions).where(and(eq(sessions.classId, input.classId), eq(sessions.status, "scheduled")));
      } else if (input.sessionId) {
        const [one] = await tx.select().from(sessions).where(eq(sessions.id, input.sessionId)).limit(1);
        if (!one) throw new Error("That session is no longer listed.");
        await tx.execute(sql`select id from sessions where id = ${one.id} for update`);
        targetSessions = [one];
      } else throw new Error("Choose a session.");

      const classId = targetSessions[0]?.classId ?? input.classId;
      if (!classId) throw new Error("Class not found.");
      const [klass] = await tx.select().from(classes).where(eq(classes.id, classId)).limit(1);
      if (!klass || klass.status !== "published") throw new Error("This class isn't open for booking.");
      const [teacher] = await tx.select().from(teachers).where(eq(teachers.id, klass.teacherId)).limit(1);
      if (!teacher || teacher.status !== "approved") throw new Error("This teacher isn't bookable yet.");

      const counts = new Map<string, number>();
      for (const session of targetSessions) counts.set(session.id, await confirmedCount(session.id, tx as unknown as typeof db));

      if (input.series) {
        if (!klass.seriesBookingEnabled) throw new Error("This teacher isn't selling the whole series.");
        const decision = decideSeriesBooking(
          targetSessions.map((session) => ({
            id: session.id,
            startsAt: session.startsAt,
            status: session.status as "scheduled",
            capacity: session.capacity,
            confirmedCount: counts.get(session.id) ?? 0,
          })),
          now,
        );
        if (!decision.ok) throw new Error(decision.reason);
        targetSessions = targetSessions.filter((session) => decision.sessionIds.includes(session.id));
      } else {
        const session = targetSessions[0]!;
        const decision = decideBooking({
          now,
          sessionStartsAt: session.startsAt,
          sessionStatus: session.status as "scheduled",
          capacity: session.capacity,
          confirmedCount: counts.get(session.id) ?? 0,
          waitlistEnabled: klass.waitlistEnabled,
          alreadyBooked: false,
        });
        const [existing] = await tx
          .select({ id: bookings.id })
          .from(bookings)
          .innerJoin(bookingSessions, eq(bookingSessions.bookingId, bookings.id))
          .where(and(eq(bookings.userId, input.userId), eq(bookingSessions.sessionId, session.id), eq(bookings.status, "confirmed")))
          .limit(1);
        if (existing) throw new Error("You're already booked for that session.");
        if (!decision.ok) throw new Error(decision.reason === "full" ? "This session is full." : "That session can't be booked.");
        if (decision.status === "waitlisted") {
          await tx.insert(waitlistEntries).values({ id: crypto.randomUUID(), sessionId: session.id, userId: input.userId, status: "waiting" });
          return { waitlisted: true as const };
        }
      }

      const listPrice = input.series ? klass.pricePerSeriesCents ?? 0 : klass.pricePerSessionCents ?? 0;
      const payWith = input.payWith ?? "cash";
      let entitlement = false;
      let packPurchaseId: string | null = null;
      let membershipSubscriptionId: string | null = null;
      let firstFree = false;

      if (payWith.startsWith("pack:")) {
        const packId = payWith.slice(5);
        const [purchase] = await tx.select().from(packPurchases).where(and(eq(packPurchases.id, packId), eq(packPurchases.userId, input.userId))).limit(1);
        if (!purchase) throw new Error("That pack isn't in your wallet.");
        const needed = targetSessions.length;
        const [pack] = await tx.select().from(packs).where(eq(packs.id, purchase.packId)).limit(1);
        const covers = offerCoversClass({ classIds: pack?.classIds ?? [], categoryIds: pack?.categoryIds ?? [] }, klass.id, klass.categoryId);
        const check = canSpendPack({ creditsRemaining: purchase.creditsRemaining, expiresAt: purchase.expiresAt, now, covers });
        if (!check.ok) throw new Error(check.reason);
        if (purchase.creditsRemaining < needed) throw new Error(`This booking needs ${needed} credits and the pack has ${purchase.creditsRemaining}.`);
        await tx.update(packPurchases).set({ creditsRemaining: purchase.creditsRemaining - needed }).where(eq(packPurchases.id, purchase.id));
        entitlement = true;
        packPurchaseId = purchase.id;
      } else if (payWith.startsWith("membership:")) {
        const subId = payWith.slice(11);
        const [sub] = await tx.select().from(membershipSubscriptions).where(eq(membershipSubscriptions.id, subId)).limit(1);
        if (!sub || sub.userId !== input.userId) throw new Error("That membership isn't active.");
        const [plan] = await tx.select().from(memberships).where(eq(memberships.id, sub.membershipId)).limit(1);
        const covers = offerCoversClass({ classIds: plan?.classIds ?? [], categoryIds: plan?.categoryIds ?? [] }, klass.id, klass.categoryId);
        const needed = targetSessions.length;
        const check = canSpendMembership({
          status: sub.status,
          periodEnd: sub.currentPeriodEnd,
          now,
          unlimited: sub.unlimited,
          classesPerPeriod: sub.classesPerPeriod,
          classesUsed: sub.classesUsedThisPeriod + needed - 1,
          covers,
        });
        if (!check.ok) throw new Error(check.reason);
        if (!sub.unlimited && sub.classesPerPeriod != null && sub.classesUsedThisPeriod + needed > sub.classesPerPeriod) {
          throw new Error("This membership doesn't have enough classes left in the period.");
        }
        await tx.update(membershipSubscriptions).set({ classesUsedThisPeriod: sub.classesUsedThisPeriod + needed }).where(eq(membershipSubscriptions.id, sub.id));
        entitlement = true;
        membershipSubscriptionId = sub.id;
      } else if (payWith === "first_free" || (!input.series && (klass.firstClassFree || teacher.firstClassFree))) {
        const [used] = await tx
          .select()
          .from(introRedemptions)
          .where(and(eq(introRedemptions.userId, input.userId), eq(introRedemptions.teacherId, teacher.id), eq(introRedemptions.restored, false)))
          .limit(1);
        if (firstClassFreeEligible({ enabled: klass.firstClassFree || teacher.firstClassFree, alreadyRedeemed: Boolean(used), listPriceCents: listPrice }) && !input.series && payWith !== "cash-only") {
          firstFree = payWith === "first_free" || payWith === "cash";
        }
        if (payWith === "first_free" && !firstFree) throw new Error("The intro offer isn't available on this class.");
      }

      let promoRow: typeof promoCodes.$inferSelect | null = null;
      let promoError: string | null = null;
      if (codeInput.code && !entitlement && !firstFree && listPrice > 0) {
        const [found] = await tx.select().from(promoCodes).where(eq(promoCodes.code, codeInput.code)).limit(1);
        if (!found) promoError = "That code isn't recognized.";
        else {
          const [totals] = await tx
            .select({ count: sql<number>`count(*)::int` })
            .from(promoRedemptions)
            .where(and(eq(promoRedemptions.promoCodeId, found.id), eq(promoRedemptions.reversed, false)));
          const [mine] = await tx
            .select({ count: sql<number>`count(*)::int` })
            .from(promoRedemptions)
            .where(and(eq(promoRedemptions.promoCodeId, found.id), eq(promoRedemptions.userId, input.userId), eq(promoRedemptions.reversed, false)));
          const verdict = validatePromo({
            promo: toRule(found),
            now,
            listPriceCents: listPrice,
            totalRedemptions: Number(totals?.count ?? 0),
            customerRedemptions: Number(mine?.count ?? 0),
            isFirstTimeStudent: !(await priorWithTeacher(input.userId, teacher.id)),
            product: { kind: "class", teacherId: teacher.id, classId: klass.id, categoryId: klass.categoryId, city: "Los Angeles" },
          });
          if (!verdict.ok) promoError = verdict.reason;
          else promoRow = found;
        }
      }

      const quote = quotePrice({
        listPriceCents: listPrice,
        feePercent: fee.feePercent,
        feeFixedCents: fee.feeFixedCents,
        promo: promoRow ? toRule(promoRow) : null,
        promoError,
        entitlement,
        firstClassFree: firstFree,
      });
      if (promoError && codeInput.code) throw new Error(promoError);

      const orderId = crypto.randomUUID();
      const status = quote.studentPaysCents === 0 ? "paid" : stripeConfigured() ? "pending" : "pay_at_studio";
      await tx.insert(orders).values({
        id: orderId,
        userId: input.userId,
        teacherId: teacher.id,
        kind: "booking",
        status,
        listPriceCents: quote.listPriceCents,
        discountCents: quote.discountCents,
        studentPaysCents: quote.studentPaysCents,
        platformFeeCents: quote.platformFeeCents,
        teacherAmountCents: quote.teacherAmountCents,
        platformFundedCents: quote.platformFundedCents,
        teacherFundedCents: quote.teacherFundedCents,
        platformLiabilityCents: quote.platformLiabilityCents,
        promoCodeId: promoRow?.id,
        paymentPath: quote.paymentPath,
        ref: attr.ref,
        utmSource: attr.utmSource,
        utmMedium: attr.utmMedium,
        utmCampaign: attr.utmCampaign,
      });
      const bookingId = crypto.randomUUID();
      await tx.insert(bookings).values({
        id: bookingId,
        orderId,
        userId: input.userId,
        classId: klass.id,
        kind: input.series ? "series" : "session",
        status: "confirmed",
        source: "online",
        packPurchaseId,
        membershipSubscriptionId,
      });
      for (const session of targetSessions) {
        await tx.insert(bookingSessions).values({ id: crypto.randomUUID(), bookingId, sessionId: session.id });
      }
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
      if (firstFree) {
        await tx.insert(introRedemptions).values({ id: crypto.randomUUID(), userId: input.userId, teacherId: teacher.id, bookingId });
      }
      if (packPurchaseId) {
        await tx.insert(creditLedger).values({ id: crypto.randomUUID(), userId: input.userId, teacherId: teacher.id, bookingId, sourceType: "pack", sourceId: packPurchaseId, direction: "consume" });
      }
      if (membershipSubscriptionId) {
        await tx.insert(creditLedger).values({ id: crypto.randomUUID(), userId: input.userId, teacherId: teacher.id, bookingId, sourceType: "membership", sourceId: membershipSubscriptionId, direction: "consume" });
      }
      return { waitlisted: false as const, orderId, bookingId, quote, status, klass, teacher, sessionCount: targetSessions.length };
    });

    if (created.waitlisted) return { orderId: undefined, error: undefined, checkoutUrl: undefined };
    if (!("orderId" in created) || !created.orderId) return {};
    if (created.status === "pending") {
      const session = await createCheckout({
        name: created.klass.title,
        amountCents: created.quote.studentPaysCents,
        applicationFeeCents: created.quote.platformFeeCents,
        destinationAccountId: created.teacher.stripeAccountId,
        customerEmail: input.email,
        successPath: `/bookings?paid=1`,
        cancelPath: `/c/${created.klass.slug}?cancelled=1`,
        metadata: { type: "order", orderId: created.orderId },
      });
      if (session?.id) {
        await db.update(orders).set({ stripeCheckoutSessionId: session.id }).where(eq(orders.id, created.orderId));
        if (session.url) return { orderId: created.orderId, checkoutUrl: session.url };
      }
      await db.update(orders).set({ status: "pay_at_studio" }).where(eq(orders.id, created.orderId));
    }
    await sendEmail({
      to: [input.email],
      subject: `You're booked: ${created.klass.title}`,
      text: `Your spot is reserved${created.status === "pay_at_studio" ? ". Pay the teacher at the studio." : "."}`,
      teacherId: created.teacher.id,
    });
    return { orderId: created.orderId };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not book." };
  }
}

export async function cancelBooking(userId: string, bookingId: string) {
  const now = new Date();
  const [booking] = await db.select().from(bookings).where(and(eq(bookings.id, bookingId), eq(bookings.userId, userId))).limit(1);
  if (!booking || booking.status !== "confirmed") return { error: "Booking not found." };
  const links = await db.select().from(bookingSessions).where(eq(bookingSessions.bookingId, booking.id));
  const rows = links.length ? await db.select().from(sessions).where(inArray(sessions.id, links.map((link) => link.sessionId))) : [];
  const upcoming = rows.filter((session) => session.startsAt > now);
  if (!upcoming.length) return { error: "This class has already started." };
  await db.update(bookings).set({ status: "cancelled", cancelledAt: now }).where(eq(bookings.id, booking.id));
  if (booking.orderId) {
    const [order] = await db.select().from(orders).where(eq(orders.id, booking.orderId)).limit(1);
    if (order?.promoCodeId) await db.update(promoRedemptions).set({ reversed: true }).where(eq(promoRedemptions.orderId, order.id));
    if (order && order.status === "paid" && order.studentPaysCents > 0) {
      const stripe = (await import("@/lib/stripe")).getStripe();
      if (stripe && order.stripePaymentIntentId) {
        await stripe.refunds.create({ payment_intent: order.stripePaymentIntentId });
        await db.update(orders).set({ status: "refunded" }).where(eq(orders.id, order.id));
      } else await db.update(orders).set({ status: "cancelled" }).where(eq(orders.id, order.id));
    } else if (order) await db.update(orders).set({ status: "cancelled" }).where(eq(orders.id, order.id));
  }
  const restore = rows.every((session) => shouldRestoreEntitlement(session.startsAt, now));
  if (restore && booking.packPurchaseId) {
    const [purchase] = await db.select().from(packPurchases).where(eq(packPurchases.id, booking.packPurchaseId)).limit(1);
    if (purchase) {
      await db.update(packPurchases).set({ creditsRemaining: purchase.creditsRemaining + links.length }).where(eq(packPurchases.id, purchase.id));
      await db.insert(creditLedger).values({ id: crypto.randomUUID(), userId, bookingId, sourceType: "pack", sourceId: purchase.id, direction: "restore" });
    }
  }
  if (restore && booking.membershipSubscriptionId) {
    const [sub] = await db.select().from(membershipSubscriptions).where(eq(membershipSubscriptions.id, booking.membershipSubscriptionId)).limit(1);
    if (sub) {
      await db.update(membershipSubscriptions).set({ classesUsedThisPeriod: Math.max(0, sub.classesUsedThisPeriod - links.length) }).where(eq(membershipSubscriptions.id, sub.id));
      await db.insert(creditLedger).values({ id: crypto.randomUUID(), userId, bookingId, sourceType: "membership", sourceId: sub.id, direction: "restore" });
    }
  }
  if (restore) await db.update(introRedemptions).set({ restored: true }).where(eq(introRedemptions.bookingId, booking.id));
  return { ok: true };
}

export async function purchaseOffer(input: { userId: string; email: string; kind: "pack" | "membership"; id: string; code?: string }) {
  const fee = await fees();
  const attr = await attribution();
  const normalized = normalizeCodes([input.code ?? "", attr.code]);
  if (normalized.error) return { error: normalized.error };
  const now = new Date();
  await releaseExpiredCheckoutHolds(now);
  if (input.kind === "pack") {
    const [pack] = await db.select().from(packs).where(eq(packs.id, input.id)).limit(1);
    if (!pack || !pack.active) return { error: "That pack is unavailable." };
    const [teacher] = await db.select().from(teachers).where(eq(teachers.id, pack.teacherId)).limit(1);
    let promoError: string | null = null;
    let promo: typeof promoCodes.$inferSelect | null = null;
    if (normalized.code) {
      const [found] = await db.select().from(promoCodes).where(eq(promoCodes.code, normalized.code)).limit(1);
      if (!found) promoError = "That code isn't recognized.";
      else {
        const verdict = validatePromo({
          promo: toRule(found),
          now,
          listPriceCents: pack.priceCents,
          totalRedemptions: 0,
          customerRedemptions: 0,
          isFirstTimeStudent: teacher ? !(await priorWithTeacher(input.userId, teacher.id)) : true,
          product: { kind: "pack", teacherId: pack.teacherId, packId: pack.id },
        });
        if (!verdict.ok) promoError = verdict.reason;
        else promo = found;
      }
    }
    if (promoError) return { error: promoError };
    const quote = quotePrice({ listPriceCents: pack.priceCents, feePercent: fee.feePercent, feeFixedCents: fee.feeFixedCents, promo: promo ? toRule(promo) : null });
    const orderId = crypto.randomUUID();
    const purchaseId = crypto.randomUUID();
    const status = quote.studentPaysCents === 0 ? "paid" : stripeConfigured() ? "pending" : "pay_at_studio";
    await db.insert(orders).values({
      id: orderId,
      userId: input.userId,
      teacherId: pack.teacherId,
      kind: "pack",
      status,
      listPriceCents: quote.listPriceCents,
      discountCents: quote.discountCents,
      studentPaysCents: quote.studentPaysCents,
      platformFeeCents: quote.platformFeeCents,
      teacherAmountCents: quote.teacherAmountCents,
      platformFundedCents: quote.platformFundedCents,
      teacherFundedCents: quote.teacherFundedCents,
      platformLiabilityCents: quote.platformLiabilityCents,
      promoCodeId: promo?.id,
      paymentPath: quote.paymentPath,
      ref: attr.ref,
      utmSource: attr.utmSource,
      utmMedium: attr.utmMedium,
      utmCampaign: attr.utmCampaign,
    });
    await db.insert(packPurchases).values({
      id: purchaseId,
      orderId,
      userId: input.userId,
      packId: pack.id,
      teacherId: pack.teacherId,
      creditsTotal: pack.creditCount,
      creditsRemaining: status === "pending" ? 0 : pack.creditCount,
      expiresAt: new Date(now.getTime() + pack.expiryDays * 86_400_000),
    });
    if (status === "pending" && teacher) {
      const session = await createCheckout({
        name: pack.name,
        amountCents: quote.studentPaysCents,
        applicationFeeCents: quote.platformFeeCents,
        destinationAccountId: teacher.stripeAccountId,
        customerEmail: input.email,
        successPath: "/bookings?pack=1",
        cancelPath: `/t/${teacher.slug}`,
        metadata: { type: "order", orderId },
      });
      if (session?.url) {
        await db.update(orders).set({ stripeCheckoutSessionId: session.id }).where(eq(orders.id, orderId));
        return { checkoutUrl: session.url };
      }
      await db.update(orders).set({ status: "pay_at_studio" }).where(eq(orders.id, orderId));
      await db.update(packPurchases).set({ creditsRemaining: pack.creditCount }).where(eq(packPurchases.id, purchaseId));
    }
    return { ok: true };
  }
  const [plan] = await db.select().from(memberships).where(eq(memberships.id, input.id)).limit(1);
  if (!plan || !plan.active) return { error: "That membership is unavailable." };
  const [teacher] = await db.select().from(teachers).where(eq(teachers.id, plan.teacherId)).limit(1);
  const quote = quotePrice({ listPriceCents: plan.priceCents, feePercent: fee.feePercent, feeFixedCents: fee.feeFixedCents });
  const orderId = crypto.randomUUID();
  const subId = crypto.randomUUID();
  const status = stripeConfigured() && quote.studentPaysCents > 0 ? "pending" : "pay_at_studio";
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + plan.termMonths);
  await db.insert(orders).values({
    id: orderId,
    userId: input.userId,
    teacherId: plan.teacherId,
    kind: "membership",
    status: quote.studentPaysCents === 0 ? "paid" : status,
    listPriceCents: quote.listPriceCents,
    discountCents: 0,
    studentPaysCents: quote.studentPaysCents,
    platformFeeCents: quote.platformFeeCents,
    teacherAmountCents: quote.teacherAmountCents,
    platformLiabilityCents: quote.platformLiabilityCents,
    paymentPath: "cash",
  });
  await db.insert(membershipSubscriptions).values({
    id: subId,
    orderId,
    userId: input.userId,
    membershipId: plan.id,
    teacherId: plan.teacherId,
    status: "active",
    currentPeriodStart: now,
    currentPeriodEnd: periodEnd,
    classesPerPeriod: plan.classesPerPeriod,
    unlimited: plan.kind === "unlimited",
  });
  if (stripeConfigured() && quote.studentPaysCents > 0 && teacher) {
    const session = await createCheckout({
      name: plan.name,
      amountCents: quote.studentPaysCents,
      applicationFeeCents: quote.platformFeeCents,
      destinationAccountId: teacher.stripeAccountId,
      customerEmail: input.email,
      successPath: "/bookings?membership=1",
      cancelPath: `/t/${teacher.slug}`,
      metadata: { type: "order", orderId },
      recurring: plan.recurring ? { interval: "month", intervalCount: plan.termMonths } : null,
    });
    if (session?.url) {
      await db.update(orders).set({ stripeCheckoutSessionId: session.id, status: "pending" }).where(eq(orders.id, orderId));
      return { checkoutUrl: session.url };
    }
  }
  return { ok: true };
}
