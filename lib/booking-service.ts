import { and, eq, inArray, lte, ne, sql } from "drizzle-orm";
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
  policyAcceptances,
  promoRedemptions,
  sessions,
  teacherPolicies,
  teachers,
  user,
  visitBookings,
  waitlistEntries,
} from "@/lib/db/schema";
import { sendEmail } from "@/lib/email";
import {
  canSpendMembership,
  canSpendPack,
  firstClassFreeEligible,
  checkoutPromoCode,
  offerCoversClass,
  quotePrice,
  shouldRestoreEntitlement,
  validatePromo,
  type PromoRule,
} from "@/lib/pricing";
import {
  collectsOnline,
  duplicateSeriesBooking,
  membershipStatusOnAbandon,
  membershipStatusOnCreate,
  membershipStatusOnPayment,
  orderMoney,
  packCreditsOnCreate,
  packCreditsOnPayment,
  parseAttributionCookie,
  refundCancelsBooking,
  sessionLockOrder,
} from "@/lib/checkout-rules";
import { paidCheckoutSendsBookingEmail, studioCanSell } from "@/lib/review-rules";
import { checkoutHoldCutoff, checkoutHoldMinutes } from "@/lib/holds";
import { resolvedPolicy, studentCancelOutcome, lateCancelFee } from "@/lib/cancel-policy";
import { cardPaymentsReady, statementDescriptor } from "@/lib/connect-rules";
import { emitNotification } from "@/lib/notifications";
import { grantStudioCredit, issueRefund } from "@/lib/refunds";
import { policySummary, SHIP_DEFAULTS } from "@/lib/ship-defaults";
import { createCheckout, getStripe, stripeConfigured } from "@/lib/stripe";
import { notifyOfferPurchased, notifyStudentConfirmed, notifyTeacherOfBooking } from "@/lib/worker";

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
    const parsed = parseAttributionCookie(raw);
    ref = parsed.ref;
    utmSource = parsed.utmSource;
    utmMedium = parsed.utmMedium;
    utmCampaign = parsed.utmCampaign;
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
    await db.update(visitBookings).set({ status: "cancelled", cancelledAt: now }).where(and(eq(visitBookings.orderId, order.id), eq(visitBookings.status, "confirmed")));
    await db.update(promoRedemptions).set({ reversed: true }).where(eq(promoRedemptions.orderId, order.id));
    await db.update(membershipSubscriptions).set({ status: membershipStatusOnAbandon() }).where(eq(membershipSubscriptions.orderId, order.id));
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
  policyAccepted?: boolean;
  ip?: string | null;
}): Promise<{ error?: string; checkoutUrl?: string; orderId?: string; waitlisted?: boolean; alreadyBooked?: boolean }> {
  const attr = await attribution();
  const codeInput = checkoutPromoCode(input.code, attr.code);
  if (codeInput.error) return { error: codeInput.error };
  const fee = await fees();
  const now = new Date();
  await releaseExpiredCheckoutHolds(now);

  try {
    const created = await db.transaction(async (tx) => {
      let targetSessions: (typeof sessions.$inferSelect)[] = [];
      if (input.series) {
        if (!input.classId) throw new Error("Choose a class.");
        const listed = await tx.select({ id: sessions.id }).from(sessions).where(and(eq(sessions.classId, input.classId), eq(sessions.status, "scheduled")));
        for (const id of sessionLockOrder(listed.map((row) => row.id))) {
          await tx.execute(sql`select id from sessions where id = ${id} for update`);
        }
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
        const priorSeries = await tx
          .select({ classId: bookings.classId, kind: bookings.kind, status: bookings.status, orderId: bookings.orderId })
          .from(bookings)
          .where(and(eq(bookings.userId, input.userId), eq(bookings.classId, klass.id), eq(bookings.kind, "series")));
        if (duplicateSeriesBooking(priorSeries, klass.id)) {
          return { waitlisted: false as const, alreadyBooked: true as const, orderId: priorSeries.find((row) => row.status === "confirmed")?.orderId ?? undefined };
        }
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
          return { waitlisted: true as const, teacherUserId: teacher.userId, title: klass.title, classSlug: klass.slug };
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
      const online = collectsOnline(quote.studentPaysCents, stripeConfigured());
      const money = orderMoney(quote, online);
      const status = quote.studentPaysCents === 0 ? "paid" : online ? "pending" : "pay_at_studio";
      await tx.insert(orders).values({
        id: orderId,
        userId: input.userId,
        teacherId: teacher.id,
        kind: "booking",
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
      return { waitlisted: false as const, alreadyBooked: false as const, orderId, bookingId, quote, status, klass, teacher, sessionCount: targetSessions.length };
    });

    if ("waitlisted" in created && created.waitlisted) {
      if ("teacherUserId" in created && created.teacherUserId) {
        await emitNotification({ userId: created.teacherUserId, event: "waitlist.joined", audience: "teacher", title: `Waitlist: ${created.title}`, body: `${input.name} joined the waitlist.`, href: `/c/${created.classSlug}` });
        await emitNotification({ userId: input.userId, event: "waitlist.joined", audience: "student", title: `You're on the waitlist for ${created.title}`, body: "You do not have a reserved seat yet.", href: "/bookings" });
      }
      return { waitlisted: true };
    }
    if ("alreadyBooked" in created && created.alreadyBooked) return { orderId: created.orderId, alreadyBooked: true };
    if (!("orderId" in created) || !created.orderId || !("quote" in created)) return {};
    if (input.policyAccepted) {
      const [settings] = await db.select().from(platformSettings).limit(1);
      const text = policySummary({
        fullRefundHours: settings?.studentFullRefundHours ?? SHIP_DEFAULTS.studentFullRefundHours,
        creditOnlyHours: settings?.studentCreditOnlyHours ?? SHIP_DEFAULTS.studentCreditOnlyHours,
        lateCancelFeeCents: settings?.lateCancelFeeCents ?? 0,
        noShowFeeCents: settings?.noShowFeeCents ?? 0,
      });
      await db.insert(policyAcceptances).values({
        id: crypto.randomUUID(),
        userId: input.userId,
        orderId: created.orderId,
        policyVersion: settings?.policyVersion ?? SHIP_DEFAULTS.policyVersion,
        policyText: text,
        ip: input.ip,
      });
    }
    const ready = cardPaymentsReady({ stripeOn: stripeConfigured(), chargesEnabled: Boolean(created.teacher.stripeChargesEnabled) });
    if (created.status === "pending" && !ready.ok) {
      await abandonFailedCheckout(created.orderId);
      return { error: ready.reason };
    }
    if (created.status === "pending") {
      try {
        const session = await createCheckout({
          name: created.klass.title,
          amountCents: created.quote.studentPaysCents,
          applicationFeeCents: created.quote.platformFeeCents,
          destinationAccountId: created.teacher.stripeAccountId,
          customerEmail: input.email,
          successPath: `/bookings?paid=1`,
          cancelPath: `/c/${created.klass.slug}?cancelled=1`,
          metadata: { type: "order", orderId: created.orderId, userId: input.userId },
          statementDescriptor: statementDescriptor(created.teacher.studioName || "Studio", SHIP_DEFAULTS.statementDescriptorPrefix),
        });
        if (session?.id) {
          await db.update(orders).set({ stripeCheckoutSessionId: session.id }).where(eq(orders.id, created.orderId));
          if (session.url) return { orderId: created.orderId, checkoutUrl: session.url };
        }
      } catch (error) {
        await abandonFailedCheckout(created.orderId);
        return { error: error instanceof Error ? error.message : "Could not book." };
      }
      const offline = orderMoney(created.quote, false);
      await db.update(orders).set({ status: "pay_at_studio", platformFeeCents: offline.platformFeeCents, teacherAmountCents: offline.teacherAmountCents, platformLiabilityCents: offline.platformLiabilityCents }).where(eq(orders.id, created.orderId));
    }
    await sendEmail({
      to: [input.email],
      subject: `You're booked: ${created.klass.title}`,
      text: `Your spot is reserved${created.status === "pay_at_studio" ? ". Pay the teacher at the studio." : "."}`,
      teacherId: created.teacher.id,
    });
    await notifyTeacherOfBooking({ teacherUserId: created.teacher.userId, studentName: input.name, title: created.klass.title, href: `/teach` });
    await notifyStudentConfirmed({ userId: input.userId, title: created.klass.title, href: `/c/${created.klass.slug}` });
    return { orderId: created.orderId };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not book." };
  }
}

export async function abandonFailedCheckout(orderId: string) {
  const now = new Date();
  const held = await db.select().from(bookings).where(and(eq(bookings.orderId, orderId), eq(bookings.status, "confirmed")));
  for (const booking of held) await releaseBookingSeat(booking, now);
  await db.update(orders).set({ status: "cancelled", updatedAt: now }).where(and(eq(orders.id, orderId), eq(orders.status, "pending")));
  await db.update(promoRedemptions).set({ reversed: true }).where(eq(promoRedemptions.orderId, orderId));
}

async function releaseBookingSeat(booking: typeof bookings.$inferSelect, now: Date) {
  const cancelled = await db
    .update(bookings)
    .set({ status: "cancelled", cancelledAt: now })
    .where(and(eq(bookings.id, booking.id), eq(bookings.status, "confirmed")))
    .returning({ id: bookings.id });
  if (!cancelled.length) return;
  const links = await db.select().from(bookingSessions).where(eq(bookingSessions.bookingId, booking.id));
  const rows = links.length ? await db.select().from(sessions).where(inArray(sessions.id, links.map((link) => link.sessionId))) : [];
  const restore = rows.every((session) => shouldRestoreEntitlement(session.startsAt, now));
  if (restore && booking.packPurchaseId) {
    const [purchase] = await db.select().from(packPurchases).where(eq(packPurchases.id, booking.packPurchaseId)).limit(1);
    if (purchase) {
      await db.update(packPurchases).set({ creditsRemaining: purchase.creditsRemaining + links.length }).where(eq(packPurchases.id, purchase.id));
      await db.insert(creditLedger).values({ id: crypto.randomUUID(), userId: booking.userId, bookingId: booking.id, sourceType: "pack", sourceId: purchase.id, direction: "restore" });
    }
  }
  if (restore && booking.membershipSubscriptionId) {
    const [sub] = await db.select().from(membershipSubscriptions).where(eq(membershipSubscriptions.id, booking.membershipSubscriptionId)).limit(1);
    if (sub) {
      await db.update(membershipSubscriptions).set({ classesUsedThisPeriod: Math.max(0, sub.classesUsedThisPeriod - links.length) }).where(eq(membershipSubscriptions.id, sub.id));
      await db.insert(creditLedger).values({ id: crypto.randomUUID(), userId: booking.userId, bookingId: booking.id, sourceType: "membership", sourceId: sub.id, direction: "restore" });
    }
  }
  if (restore) await db.update(introRedemptions).set({ restored: true }).where(and(eq(introRedemptions.bookingId, booking.id), eq(introRedemptions.restored, false)));
}

export async function releaseVisitSeat(visit: typeof visitBookings.$inferSelect, now: Date) {
  const cancelled = await db
    .update(visitBookings)
    .set({ status: "cancelled", cancelledAt: now })
    .where(and(eq(visitBookings.id, visit.id), eq(visitBookings.status, "confirmed")))
    .returning({ id: visitBookings.id });
  if (!cancelled.length) return;
  if (visit.packPurchaseId) {
    const [purchase] = await db.select().from(packPurchases).where(eq(packPurchases.id, visit.packPurchaseId)).limit(1);
    if (purchase) {
      await db.update(packPurchases).set({ creditsRemaining: purchase.creditsRemaining + 1 }).where(eq(packPurchases.id, purchase.id));
      await db.insert(creditLedger).values({ id: crypto.randomUUID(), userId: visit.userId, sourceType: "pack", sourceId: purchase.id, direction: "restore" });
    }
  }
  if (visit.membershipSubscriptionId) {
    const [sub] = await db.select().from(membershipSubscriptions).where(eq(membershipSubscriptions.id, visit.membershipSubscriptionId)).limit(1);
    if (sub) {
      await db.update(membershipSubscriptions).set({ classesUsedThisPeriod: Math.max(0, sub.classesUsedThisPeriod - 1) }).where(eq(membershipSubscriptions.id, sub.id));
      await db.insert(creditLedger).values({ id: crypto.randomUUID(), userId: visit.userId, sourceType: "membership", sourceId: sub.id, direction: "restore" });
    }
  }
}

export async function cancelBooking(userId: string, bookingId: string) {
  const now = new Date();
  const [booking] = await db.select().from(bookings).where(and(eq(bookings.id, bookingId), eq(bookings.userId, userId))).limit(1);
  if (!booking || booking.status !== "confirmed") return { error: "Booking not found." };
  const links = await db.select().from(bookingSessions).where(eq(bookingSessions.bookingId, booking.id));
  const rows = links.length ? await db.select().from(sessions).where(inArray(sessions.id, links.map((link) => link.sessionId))) : [];
  const upcoming = rows.filter((session) => session.startsAt > now).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  if (!upcoming.length) return { error: "This class has already started." };
  const [klass] = await db.select().from(classes).where(eq(classes.id, booking.classId)).limit(1);
  const [platform] = await db.select().from(platformSettings).limit(1);
  const [override] = klass ? await db.select().from(teacherPolicies).where(eq(teacherPolicies.teacherId, klass.teacherId)).limit(1) : [];
  const policy = resolvedPolicy(
    {
      fullRefundHours: platform?.studentFullRefundHours ?? SHIP_DEFAULTS.studentFullRefundHours,
      creditOnlyHours: platform?.studentCreditOnlyHours ?? SHIP_DEFAULTS.studentCreditOnlyHours,
      lateCancelFeeCents: platform?.lateCancelFeeCents ?? SHIP_DEFAULTS.lateCancelFeeCents,
      noShowFeeCents: platform?.noShowFeeCents ?? SHIP_DEFAULTS.noShowFeeCents,
    },
    override ?? null,
  );
  const outcome = studentCancelOutcome({ now, startsAt: upcoming[0]!.startsAt, fullRefundHours: policy.fullRefundHours, creditOnlyHours: policy.creditOnlyHours });
  const fee = lateCancelFee({ outcome, lateCancelFeeCents: policy.lateCancelFeeCents });
  await releaseBookingSeat(booking, now);
  if (booking.orderId && outcome === "full_refund") {
    await issueRefund({ orderId: booking.orderId, reasonCode: "student_cancel", actorUserId: userId, scope: booking.id });
  } else if (booking.orderId && outcome === "credit" && klass) {
    const [order] = await db.select().from(orders).where(eq(orders.id, booking.orderId)).limit(1);
    if (order) await grantStudioCredit(userId, klass.teacherId, Math.max(0, order.studentPaysCents - order.refundedCents));
  }
  if (klass) {
    const refunded = outcome === "full_refund";
    await emitNotification({
      userId,
      event: refunded ? "booking.refunded" : "booking.cancelled",
      audience: "student",
      title: `Cancelled ${klass.title}`,
      body: refunded ? "A full refund is on the way to your original payment method." : outcome === "credit" ? "Studio credit was added to your account." : fee ? `No refund. A late cancel fee of $${(fee / 100).toFixed(2)} may apply.` : "This cancellation is outside the refund window.",
      href: `/c/${klass.slug}`,
    });
    const [teacher] = await db.select().from(teachers).where(eq(teachers.id, klass.teacherId)).limit(1);
    if (teacher) {
      await emitNotification({
        userId: teacher.userId,
        event: "booking.cancelled",
        audience: "teacher",
        title: `Cancellation: ${klass.title}`,
        body: "A student cancelled.",
        href: "/teach",
      });
    }
  }
  return { ok: true, outcome, feeCents: fee };
}

export async function fulfillPaidCheckout(orderId: string, paymentIntent: string | null, subscriptionId: string | null) {
  const updated = await db
    .update(orders)
    .set({ status: "paid", stripePaymentIntentId: paymentIntent, stripeSubscriptionId: subscriptionId, updatedAt: new Date() })
    .where(and(eq(orders.id, orderId), eq(orders.status, "pending")))
    .returning();
  if (!updated.length) return;
  const order = updated[0]!;
  if (order.kind === "pack") {
    const purchases = await db.select().from(packPurchases).where(eq(packPurchases.orderId, order.id));
    for (const purchase of purchases) {
      await db.update(packPurchases).set({ creditsRemaining: packCreditsOnPayment(purchase.creditsTotal) }).where(eq(packPurchases.id, purchase.id));
    }
  }
  if (order.kind === "membership") {
    await db
      .update(membershipSubscriptions)
      .set({ status: membershipStatusOnPayment() })
      .where(and(eq(membershipSubscriptions.orderId, order.id), eq(membershipSubscriptions.status, "pending")));
  }
    if ((order.kind === "pack" || order.kind === "membership") && order.teacherId) {
      const [teacher] = await db.select().from(teachers).where(eq(teachers.id, order.teacherId)).limit(1);
      if (teacher) await notifyOfferPurchased({ teacherUserId: teacher.userId, title: order.kind, href: "/teach/billing" });
    }
    if (paidCheckoutSendsBookingEmail(order.kind) && order.userId) {
    const [person] = await db.select({ email: user.email }).from(user).where(eq(user.id, order.userId)).limit(1);
    const [booking] = await db.select().from(bookings).where(eq(bookings.orderId, order.id)).limit(1);
    const [klass] = booking ? await db.select().from(classes).where(eq(classes.id, booking.classId)).limit(1) : [];
    if (person?.email && klass) {
      await sendEmail({
        to: [person.email],
        subject: `You're booked: ${klass.title}`,
        text: "Your spot is reserved.",
        teacherId: order.teacherId ?? undefined,
      });
    }
  }
}

export async function refundOrderByPaymentIntent(intent: string) {
  const now = new Date();
  const updated = await db
    .update(orders)
    .set({ status: "refunded", updatedAt: now })
    .where(and(eq(orders.stripePaymentIntentId, intent), ne(orders.status, "refunded")))
    .returning();
  if (!updated.length) return;
  for (const order of updated) {
    await db.update(promoRedemptions).set({ reversed: true }).where(eq(promoRedemptions.orderId, order.id));
    if (order.kind === "pack") {
      await db.update(packPurchases).set({ creditsRemaining: 0 }).where(eq(packPurchases.orderId, order.id));
    }
    if (order.kind === "membership") {
      await db.update(membershipSubscriptions).set({ status: membershipStatusOnAbandon() }).where(eq(membershipSubscriptions.orderId, order.id));
    }
    const linked = await db.select().from(bookings).where(eq(bookings.orderId, order.id));
    for (const booking of linked) {
      if (!refundCancelsBooking(booking.status)) continue;
      await releaseBookingSeat(booking, now);
    }
    const visits = await db.select().from(visitBookings).where(eq(visitBookings.orderId, order.id));
    for (const visit of visits) {
      if (!refundCancelsBooking(visit.status)) continue;
      await releaseVisitSeat(visit, now);
    }
  }
}

async function redemptionCounts(promoCodeId: string, userId: string) {
  const [totals] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(promoRedemptions)
    .where(and(eq(promoRedemptions.promoCodeId, promoCodeId), eq(promoRedemptions.reversed, false)));
  const [mine] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(promoRedemptions)
    .where(and(eq(promoRedemptions.promoCodeId, promoCodeId), eq(promoRedemptions.userId, userId), eq(promoRedemptions.reversed, false)));
  return { totalRedemptions: Number(totals?.count ?? 0), customerRedemptions: Number(mine?.count ?? 0) };
}

async function recordPromoRedemption(promoId: string, userId: string, orderId: string, quote: { discountCents: number; platformFundedCents: number; teacherFundedCents: number }) {
  await db.insert(promoRedemptions).values({
    id: crypto.randomUUID(),
    promoCodeId: promoId,
    userId,
    orderId,
    discountCents: quote.discountCents,
    platformFundedCents: quote.platformFundedCents,
    teacherFundedCents: quote.teacherFundedCents,
  });
}

export async function purchaseOffer(input: { userId: string; email: string; kind: "pack" | "membership"; id: string; code?: string }) {
  const fee = await fees();
  const attr = await attribution();
  const normalized = checkoutPromoCode(input.code, attr.code);
  if (normalized.error) return { error: normalized.error };
  const now = new Date();
  await releaseExpiredCheckoutHolds(now);
  if (input.kind === "pack") {
    const [pack] = await db.select().from(packs).where(eq(packs.id, input.id)).limit(1);
    if (!pack || !pack.active) return { error: "That pack is unavailable." };
    const [teacher] = await db.select().from(teachers).where(eq(teachers.id, pack.teacherId)).limit(1);
    if (!teacher || !studioCanSell(teacher.status)) return { error: "This teacher isn't bookable yet." };
    let promoError: string | null = null;
    let promo: typeof promoCodes.$inferSelect | null = null;
    if (normalized.code) {
      const [found] = await db.select().from(promoCodes).where(eq(promoCodes.code, normalized.code)).limit(1);
      if (!found) promoError = "That code isn't recognized.";
      else {
        const counts = await redemptionCounts(found.id, input.userId);
        const verdict = validatePromo({
          promo: toRule(found),
          now,
          listPriceCents: pack.priceCents,
          totalRedemptions: counts.totalRedemptions,
          customerRedemptions: counts.customerRedemptions,
          isFirstTimeStudent: teacher ? !(await priorWithTeacher(input.userId, teacher.id)) : true,
          product: { kind: "pack", teacherId: pack.teacherId, packId: pack.id },
        });
        if (!verdict.ok) promoError = verdict.reason;
        else promo = found;
      }
    }
    if (promoError) return { error: promoError };
    const quote = quotePrice({ listPriceCents: pack.priceCents, feePercent: fee.feePercent, feeFixedCents: fee.feeFixedCents, promo: promo ? toRule(promo) : null });
    const packReady = cardPaymentsReady({ stripeOn: stripeConfigured(), chargesEnabled: Boolean(teacher.stripeChargesEnabled) });
    if (quote.studentPaysCents > 0 && !packReady.ok) return { error: packReady.reason };
    const orderId = crypto.randomUUID();
    const purchaseId = crypto.randomUUID();
    const online = collectsOnline(quote.studentPaysCents, stripeConfigured());
    const money = orderMoney(quote, online);
    const status = quote.studentPaysCents === 0 ? "paid" : online ? "pending" : "pay_at_studio";
    await db.insert(orders).values({
      id: orderId,
      userId: input.userId,
      teacherId: pack.teacherId,
      kind: "pack",
      status,
      listPriceCents: quote.listPriceCents,
      discountCents: quote.discountCents,
      studentPaysCents: quote.studentPaysCents,
      platformFeeCents: money.platformFeeCents,
      teacherAmountCents: money.teacherAmountCents,
      platformFundedCents: quote.platformFundedCents,
      teacherFundedCents: quote.teacherFundedCents,
      platformLiabilityCents: money.platformLiabilityCents,
      promoCodeId: promo?.id,
      paymentPath: quote.paymentPath,
      ref: attr.ref,
      utmSource: attr.utmSource,
      utmMedium: attr.utmMedium,
      utmCampaign: attr.utmCampaign,
    });
    if (promo) await recordPromoRedemption(promo.id, input.userId, orderId, quote);
    await db.insert(packPurchases).values({
      id: purchaseId,
      orderId,
      userId: input.userId,
      packId: pack.id,
      teacherId: pack.teacherId,
      creditsTotal: pack.creditCount,
      creditsRemaining: packCreditsOnCreate({ awaitingCardPayment: status === "pending", creditCount: pack.creditCount }),
      expiresAt: new Date(now.getTime() + pack.expiryDays * 86_400_000),
    });
    if (status === "pending" && teacher) {
      const session = await createCheckout({
        name: pack.name,
        amountCents: quote.studentPaysCents,
        applicationFeeCents: money.platformFeeCents,
        destinationAccountId: teacher.stripeAccountId,
        customerEmail: input.email,
        successPath: "/bookings?pack=1",
        cancelPath: `/t/${teacher.slug}`,
        metadata: { type: "order", orderId, userId: input.userId },
        statementDescriptor: statementDescriptor(teacher.studioName || "Studio", SHIP_DEFAULTS.statementDescriptorPrefix),
      });
      if (session?.url) {
        await db.update(orders).set({ stripeCheckoutSessionId: session.id }).where(eq(orders.id, orderId));
        return { checkoutUrl: session.url };
      }
      const offline = orderMoney(quote, false);
      await db.update(orders).set({ status: "pay_at_studio", platformFeeCents: offline.platformFeeCents, teacherAmountCents: offline.teacherAmountCents, platformLiabilityCents: offline.platformLiabilityCents }).where(eq(orders.id, orderId));
      await db.update(packPurchases).set({ creditsRemaining: packCreditsOnPayment(pack.creditCount) }).where(eq(packPurchases.id, purchaseId));
    }
    if (status !== "pending") await notifyOfferPurchased({ teacherUserId: teacher.userId, title: pack.name, href: "/teach/billing" });
    return { ok: true };
  }
  const [plan] = await db.select().from(memberships).where(eq(memberships.id, input.id)).limit(1);
  if (!plan || !plan.active) return { error: "That membership is unavailable." };
  const [teacher] = await db.select().from(teachers).where(eq(teachers.id, plan.teacherId)).limit(1);
  if (!teacher || !studioCanSell(teacher.status)) return { error: "This teacher isn't bookable yet." };
  let promoError: string | null = null;
  let promo: typeof promoCodes.$inferSelect | null = null;
  if (normalized.code) {
    const [found] = await db.select().from(promoCodes).where(eq(promoCodes.code, normalized.code)).limit(1);
    if (!found) promoError = "That code isn't recognized.";
    else {
      const counts = await redemptionCounts(found.id, input.userId);
      const verdict = validatePromo({
        promo: toRule(found),
        now,
        listPriceCents: plan.priceCents,
        totalRedemptions: counts.totalRedemptions,
        customerRedemptions: counts.customerRedemptions,
        isFirstTimeStudent: teacher ? !(await priorWithTeacher(input.userId, teacher.id)) : true,
        product: { kind: "membership", teacherId: plan.teacherId, membershipId: plan.id },
      });
      if (!verdict.ok) promoError = verdict.reason;
      else promo = found;
    }
  }
  if (promoError) return { error: promoError };
  const quote = quotePrice({ listPriceCents: plan.priceCents, feePercent: fee.feePercent, feeFixedCents: fee.feeFixedCents, promo: promo ? toRule(promo) : null });
  const planReady = cardPaymentsReady({ stripeOn: stripeConfigured(), chargesEnabled: Boolean(teacher.stripeChargesEnabled) });
  if (quote.studentPaysCents > 0 && !planReady.ok) return { error: planReady.reason };
  const orderId = crypto.randomUUID();
  const subId = crypto.randomUUID();
  const online = collectsOnline(quote.studentPaysCents, stripeConfigured());
  const money = orderMoney(quote, online);
  const status = quote.studentPaysCents === 0 ? "paid" : online ? "pending" : "pay_at_studio";
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + plan.termMonths);
  await db.insert(orders).values({
    id: orderId,
    userId: input.userId,
    teacherId: plan.teacherId,
    kind: "membership",
    status,
    listPriceCents: quote.listPriceCents,
    discountCents: quote.discountCents,
    studentPaysCents: quote.studentPaysCents,
    platformFeeCents: money.platformFeeCents,
    teacherAmountCents: money.teacherAmountCents,
    platformFundedCents: quote.platformFundedCents,
    teacherFundedCents: quote.teacherFundedCents,
    platformLiabilityCents: money.platformLiabilityCents,
    promoCodeId: promo?.id,
    paymentPath: quote.paymentPath,
    ref: attr.ref,
    utmSource: attr.utmSource,
    utmMedium: attr.utmMedium,
    utmCampaign: attr.utmCampaign,
  });
  if (promo) await recordPromoRedemption(promo.id, input.userId, orderId, quote);
  await db.insert(membershipSubscriptions).values({
    id: subId,
    orderId,
    userId: input.userId,
    membershipId: plan.id,
    teacherId: plan.teacherId,
    status: membershipStatusOnCreate(status === "pending"),
    currentPeriodStart: now,
    currentPeriodEnd: periodEnd,
    classesPerPeriod: plan.classesPerPeriod,
    unlimited: plan.kind === "unlimited",
  });
  if (status === "pending" && teacher) {
    const session = await createCheckout({
      name: plan.name,
      amountCents: quote.studentPaysCents,
      applicationFeeCents: money.platformFeeCents,
      destinationAccountId: teacher.stripeAccountId,
      customerEmail: input.email,
      successPath: "/bookings?membership=1",
      cancelPath: `/t/${teacher.slug}`,
      metadata: { type: "order", orderId, userId: input.userId },
      statementDescriptor: statementDescriptor(teacher.studioName || "Studio", SHIP_DEFAULTS.statementDescriptorPrefix),
      recurring: plan.recurring ? { interval: "month", intervalCount: plan.termMonths } : null,
    });
    if (session?.url) {
      await db.update(orders).set({ stripeCheckoutSessionId: session.id, status: "pending" }).where(eq(orders.id, orderId));
      return { checkoutUrl: session.url };
    }
    const offline = orderMoney(quote, false);
    await db.update(orders).set({ status: "pay_at_studio", platformFeeCents: offline.platformFeeCents, teacherAmountCents: offline.teacherAmountCents, platformLiabilityCents: offline.platformLiabilityCents }).where(eq(orders.id, orderId));
    await db.update(membershipSubscriptions).set({ status: membershipStatusOnPayment() }).where(eq(membershipSubscriptions.id, subId));
  }
  if (status !== "pending") await notifyOfferPurchased({ teacherUserId: teacher.userId, title: plan.name, href: "/teach/billing" });
  return { ok: true };
}
