import { and, asc, eq, inArray, lte, ne, or, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { marketingCookiesAllowed } from "@/lib/privacy-server";
import { decideBooking, decideSeriesBooking } from "@/lib/booking-rules";
import { db } from "@/lib/db";
import {
  bookingSessions,
  bookings,
  classes,
  creditLedger,
  introRedemptions,
  studioCredits,
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
  services,
  teacherPolicies,
  teachers,
  user,
  visitBookings,
  waitlistEntries,
} from "@/lib/db/schema";
import { sendEmail } from "@/lib/email";
import { consentAccepted, membershipOffer } from "@/lib/renewal-copy";
import { disclosureForMembership, disclosurePayload, recordRenewalConsent, sendAcknowledgmentForOrder } from "@/lib/renewal";
import {
  canSpendMembership,
  canSpendPack,
  firstClassFreeEligible,
  checkoutPromoCode,
  offerCoversClass,
  quotePrice,
  quoteWithStudioCredit,
  shouldRestoreEntitlement,
  validatePromo,
  type ProductScope,
  type PromoRule,
} from "@/lib/pricing";
import {
  checkoutMustReleaseSeat,
  collectsOnline,
  duplicateSeriesBooking,
  membershipRenewalExtendsAccess,
  membershipStatusOnAbandon,
  membershipStatusOnCreate,
  membershipStatusOnPayment,
  orderMoney,
  renewalChargeSplit,
  packCreditsOnCreate,
  packCreditsOnPayment,
  parseAttributionCookie,
  refundCancelsBooking,
  sessionLockOrder,
} from "@/lib/checkout-rules";
import { paidCheckoutEmitsBookingNotifications, paidCheckoutSendsBookingEmail, studioCanSell } from "@/lib/review-rules";
import { checkoutHoldCutoff, checkoutHoldMinutes } from "@/lib/holds";
import { resolvedPolicy, studentCancelOutcome, lateCancelFee, nextUpcomingStart } from "@/lib/cancel-policy";
import { cardPaymentsReady, statementDescriptor } from "@/lib/connect-rules";
import { sameLocalDay } from "@/lib/messaging-rules";
import { emitNotification } from "@/lib/notifications";
import { applyStudioCredit, parseStudioCreditLedgerSource, seriesProrate, studioCreditLedgerSource, studioCreditRestoreCents } from "@/lib/refund-math";
import { consumeRefundableCash, grantStudioCredit, issueRefund } from "@/lib/refunds";
import { chargeRefundReleasesSeats } from "@/lib/webhook-idempotency";
import { policySummary, SHIP_DEFAULTS } from "@/lib/ship-defaults";
import { createCheckout, createPaymentIntent, getStripe, stripeConfigured } from "@/lib/stripe";
import { notifyOfferPurchased, notifyStudentConfirmed, notifyTeacherOfBooking } from "@/lib/worker";

export type ActionState = { error?: string; ok?: string } | null;

async function fees() {
  const [row] = await db.select().from(platformSettings).limit(1);
  if (row) return row;
  await db.insert(platformSettings).values({ id: 1, feePercent: 10, feeFixedCents: 0 });
  return { id: 1, feePercent: 10, feeFixedCents: 0 };
}

async function attribution() {
  let raw: string | undefined;
  let code = "";
  try {
    const jar = await cookies();
    raw = (await marketingCookiesAllowed()) ? jar.get("bc_attr")?.value : undefined;
    code = jar.get("bc_code")?.value ?? "";
  } catch {
    raw = undefined;
  }
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
  return { ref, utmSource, utmMedium, utmCampaign, code };
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

function paymentIntentStillCollecting(status: string) {
  return status === "succeeded" || status === "processing";
}

function stripeResourceMissing(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "resource_missing";
}

/** Keep the seat when Stripe has already collected or may still collect. Cancel an open PaymentIntent before releasing it. */
async function stripeHoldCanRelease(
  stripe: NonNullable<ReturnType<typeof getStripe>>,
  order: { stripeCheckoutSessionId: string | null; stripePaymentIntentId: string | null },
) {
  if (order.stripeCheckoutSessionId) {
    try {
      const session = await stripe.checkout.sessions.retrieve(order.stripeCheckoutSessionId);
      if (session.status === "complete" || session.payment_status === "paid") return false;
      if (session.status === "open") await stripe.checkout.sessions.expire(order.stripeCheckoutSessionId);
    } catch {
      // The Checkout session is already closed. Release the seat anyway.
    }
    return true;
  }
  if (!order.stripePaymentIntentId) return true;
  try {
    let intent = await stripe.paymentIntents.retrieve(order.stripePaymentIntentId);
    if (paymentIntentStillCollecting(intent.status)) return false;
    if (intent.status !== "canceled") {
      intent = await stripe.paymentIntents.cancel(order.stripePaymentIntentId);
      if (paymentIntentStillCollecting(intent.status) || intent.status !== "canceled") return false;
    }
  } catch (error) {
    if (!stripeResourceMissing(error)) return false;
  }
  return true;
}

export async function releaseExpiredCheckoutHolds(now = new Date(), options?: { touchStripe?: boolean }) {
  const cutoff = checkoutHoldCutoff(now, checkoutHoldMinutes());
  const stale = await db.select().from(orders).where(and(eq(orders.status, "pending"), lte(orders.createdAt, cutoff)));
  const touchStripe = options?.touchStripe !== false;
  const stripe = touchStripe ? getStripe() : null;
  let released = 0;
  for (const order of stale) {
    if (stripe && !(await stripeHoldCanRelease(stripe, order))) continue;
    const updated = await db
      .update(orders)
      .set({ status: "expired", updatedAt: now })
      .where(and(eq(orders.id, order.id), eq(orders.status, "pending")))
      .returning({ id: orders.id });
    if (!updated.length) continue;
    const linked = await db.select({ id: bookings.id }).from(bookings).where(and(eq(bookings.orderId, order.id), eq(bookings.status, "confirmed")));
    const seatLinks = linked.length
      ? await db.select({ sessionId: bookingSessions.sessionId }).from(bookingSessions).where(inArray(bookingSessions.bookingId, linked.map((row) => row.id)))
      : [];
    await db.update(bookings).set({ status: "cancelled", cancelledAt: now }).where(and(eq(bookings.orderId, order.id), eq(bookings.status, "confirmed")));
    await db.update(visitBookings).set({ status: "cancelled", cancelledAt: now }).where(and(eq(visitBookings.orderId, order.id), eq(visitBookings.status, "confirmed")));
    await db.update(promoRedemptions).set({ reversed: true }).where(eq(promoRedemptions.orderId, order.id));
    await db.update(membershipSubscriptions).set({ status: membershipStatusOnAbandon() }).where(eq(membershipSubscriptions.orderId, order.id));
    await offerOpenedSeats(seatLinks.map((link) => link.sessionId));
    released += 1;
  }
  if (touchStripe) await expireStripeForReleasedHolds();
  return released;
}

async function expireStripeForReleasedHolds() {
  const stripe = getStripe();
  if (!stripe) return;
  const leftover = await db
    .select()
    .from(orders)
    .where(and(eq(orders.status, "expired"), sql`${orders.stripeCheckoutSessionId} is not null`))
    .limit(25);
  for (const order of leftover) {
    if (!order.stripeCheckoutSessionId) continue;
    try {
      const session = await stripe.checkout.sessions.retrieve(order.stripeCheckoutSessionId);
      if (session.status === "open") await stripe.checkout.sessions.expire(order.stripeCheckoutSessionId);
    } catch {
      // Already closed.
    }
    await db.update(orders).set({ stripeCheckoutSessionId: null }).where(eq(orders.id, order.id));
  }
}

export async function confirmedCount(sessionId: string, tx: typeof db = db) {
  const [row] = await tx
    .select({ count: sql<number>`count(distinct coalesce(${bookings.userId}, ${bookings.id}))::int` })
    .from(bookingSessions)
    .innerJoin(bookings, eq(bookings.id, bookingSessions.bookingId))
    .where(and(eq(bookingSessions.sessionId, sessionId), eq(bookings.status, "confirmed")));
  return Number(row?.count ?? 0);
}

export async function offerOpenedSeats(sessionIds: string[]) {
  const unique = [...new Set(sessionIds)];
  const now = new Date();
  for (const sessionId of unique) {
    const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
    if (!session || session.startsAt <= now || session.status === "cancelled") continue;
    const taken = await confirmedCount(sessionId);
    if (taken >= session.capacity) continue;
    const [next] = await db
      .select()
      .from(waitlistEntries)
      .where(and(eq(waitlistEntries.sessionId, sessionId), eq(waitlistEntries.status, "waiting")))
      .orderBy(asc(waitlistEntries.createdAt))
      .limit(1);
    if (!next) continue;
    const claimed = await db
      .update(waitlistEntries)
      .set({ status: "offered" })
      .where(and(eq(waitlistEntries.id, next.id), eq(waitlistEntries.status, "waiting")))
      .returning({ id: waitlistEntries.id });
    if (!claimed.length) continue;
    const [person] = await db.select({ email: user.email }).from(user).where(eq(user.id, next.userId)).limit(1);
    const [klass] = await db.select().from(classes).where(eq(classes.id, session.classId)).limit(1);
    if (!person?.email || !klass) continue;
    await sendEmail({
      to: [person.email],
      subject: `A seat opened: ${klass.title}`,
      text: `A spot opened in ${klass.title}. You do not have a reserved seat yet. Book it from the class page.`,
      teacherId: klass.teacherId,
    });
  }
}

export async function priorWithTeacher(userId: string, teacherId: string) {
  const [classesRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(bookings)
    .innerJoin(classes, eq(classes.id, bookings.classId))
    .where(and(eq(bookings.userId, userId), eq(classes.teacherId, teacherId), eq(bookings.status, "confirmed")));
  if (Number(classesRow?.count ?? 0) > 0) return true;
  const [visitsRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(visitBookings)
    .innerJoin(services, eq(services.id, visitBookings.serviceId))
    .where(and(eq(visitBookings.userId, userId), eq(services.teacherId, teacherId), eq(visitBookings.status, "confirmed")));
  return Number(visitsRow?.count ?? 0) > 0;
}

function priceFields(quote: { listPriceCents: number; discountCents: number; studentPaysCents: number; codeApplied: string | null }) {
  return {
    listPriceCents: quote.listPriceCents,
    discountCents: quote.discountCents,
    studentPaysCents: quote.studentPaysCents,
    codeApplied: quote.codeApplied,
  };
}

export function checkoutPaths(returnToApp: boolean | undefined, flow: string, successPath: string, cancelPath: string) {
  if (!returnToApp) return { successPath, cancelPath };
  return {
    successPath: `/mobile/return?flow=${encodeURIComponent(flow)}&paid=1`,
    cancelPath: `/mobile/return?flow=${encodeURIComponent(flow)}&cancelled=1`,
  };
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
  paymentSheet?: boolean;
  platform?: string;
  returnToApp?: boolean;
}): Promise<{ error?: string; checkoutUrl?: string; clientSecret?: string; publishableKey?: string; orderId?: string; waitlisted?: boolean; alreadyBooked?: boolean; listPriceCents?: number; discountCents?: number; studentPaysCents?: number; codeApplied?: string | null }> {
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
        await tx.execute(sql`select id from sessions where id = ${input.sessionId} for update`);
        const [one] = await tx.select().from(sessions).where(eq(sessions.id, input.sessionId)).limit(1);
        if (!one) throw new Error("That session is no longer listed.");
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
        await tx.execute(sql`select id from pack_purchases where id = ${packId} and user_id = ${input.userId} for update`);
        const [purchase] = await tx.select().from(packPurchases).where(and(eq(packPurchases.id, packId), eq(packPurchases.userId, input.userId))).limit(1);
        if (!purchase) throw new Error("That pack isn't in your wallet.");
        const needed = targetSessions.length;
        const [pack] = await tx.select().from(packs).where(eq(packs.id, purchase.packId)).limit(1);
        const covers = offerCoversClass({ classIds: pack?.classIds ?? [], categoryIds: pack?.categoryIds ?? [] }, klass.id, klass.categoryId);
        const check = canSpendPack({ creditsRemaining: purchase.creditsRemaining, expiresAt: purchase.expiresAt, now, covers });
        if (!check.ok) throw new Error(check.reason);
        if (purchase.creditsRemaining < needed) throw new Error(`This booking needs ${needed} credits and the pack has ${purchase.creditsRemaining}.`);
        const [spent] = await tx
          .update(packPurchases)
          .set({ creditsRemaining: sql`${packPurchases.creditsRemaining} - ${needed}` })
          .where(and(eq(packPurchases.id, purchase.id), sql`${packPurchases.creditsRemaining} >= ${needed}`))
          .returning({ id: packPurchases.id });
        if (!spent) throw new Error(`This booking needs ${needed} credits and the pack has ${purchase.creditsRemaining}.`);
        entitlement = true;
        packPurchaseId = purchase.id;
      } else if (payWith.startsWith("membership:")) {
        const subId = payWith.slice(11);
        await tx.execute(sql`select id from membership_subscriptions where id = ${subId} for update`);
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
        const [spent] = await tx
          .update(membershipSubscriptions)
          .set({ classesUsedThisPeriod: sql`${membershipSubscriptions.classesUsedThisPeriod} + ${needed}` })
          .where(and(
            eq(membershipSubscriptions.id, sub.id),
            sub.unlimited || sub.classesPerPeriod == null
              ? sql`true`
              : sql`${membershipSubscriptions.classesUsedThisPeriod} + ${needed} <= ${membershipSubscriptions.classesPerPeriod}`,
          ))
          .returning({ id: membershipSubscriptions.id });
        if (!spent) throw new Error("This membership doesn't have enough classes left in the period.");
        entitlement = true;
        membershipSubscriptionId = sub.id;
      } else if (payWith === "first_free" || (!input.series && (klass.firstClassFree || teacher.firstClassFree))) {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${input.userId}:${teacher.id}`})::bigint)`);
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
      let promoError: string | null = null;
      const promoBase = Math.max(0, listPrice - studioCreditCents);
      if (codeInput.code && !entitlement && !firstFree && promoBase > 0) {
        const [found] = await tx.select().from(promoCodes).where(eq(promoCodes.code, codeInput.code)).limit(1);
        if (!found) promoError = "That code isn't recognized.";
        else {
          await tx.execute(sql`select id from promo_codes where id = ${found.id} for update`);
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
            listPriceCents: promoBase,
            totalRedemptions: Number(totals?.count ?? 0),
            customerRedemptions: Number(mine?.count ?? 0),
            isFirstTimeStudent: !(await priorWithTeacher(input.userId, teacher.id)),
            product: { kind: "class", teacherId: teacher.id, classId: klass.id, categoryId: klass.categoryId, city: "Los Angeles" },
          });
          if (!verdict.ok) promoError = verdict.reason;
          else promoRow = found;
        }
      }

      const quoteInput = {
        listPriceCents: listPrice,
        feePercent: fee.feePercent,
        feeFixedCents: fee.feeFixedCents,
        promo: promoRow ? toRule(promoRow) : null,
        promoError,
        entitlement,
        firstClassFree: firstFree,
      };
      const quote = studioCreditCents > 0 ? quoteWithStudioCredit({ ...quoteInput, appliedCents: studioCreditCents }) : quotePrice(quoteInput);
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
          discountCents: Math.max(0, quote.discountCents - studioCreditCents),
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
      if (studioCreditCents > 0) {
        await tx.insert(creditLedger).values({
          id: crypto.randomUUID(),
          userId: input.userId,
          teacherId: teacher.id,
          bookingId,
          sourceType: "studio_credit",
          sourceId: studioCreditLedgerSource(orderId, studioCreditCents),
          direction: "consume",
        });
      }
      return { waitlisted: false as const, alreadyBooked: false as const, orderId, bookingId, quote, status, klass, teacher, sessionCount: targetSessions.length };
    });

    if ("waitlisted" in created && created.waitlisted) {
      if ("teacherUserId" in created && created.teacherUserId) {
        await emitNotification({ userId: created.teacherUserId, event: "waitlist.joined", audience: "teacher", title: `Waitlist: ${created.title}`, body: `${input.name} joined the waitlist.`, href: `/c/${created.classSlug}` });
        await emitNotification({ userId: input.userId, event: "waitlist.joined", audience: "student", title: `You're on the waitlist for ${created.title}`, body: "You do not have a reserved seat yet.", href: "/bookings" });
      }
      const { capture } = await import("@/lib/analytics");
      await capture({ name: "waitlist_joined", userId: input.userId, platform: input.platform, properties: { title: "title" in created ? String(created.title) : "" } });
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
    if (!ready.ok && checkoutMustReleaseSeat({ paymentsReady: ready.ok, orderPending: created.status === "pending" })) {
      await abandonFailedCheckout(created.orderId);
      return { error: ready.reason };
    }
    const { capture } = await import("@/lib/analytics");
    await capture({ name: "booking_started", userId: input.userId, platform: input.platform, properties: { orderId: created.orderId, classId: created.klass.id } });
    if (created.quote.discountCents > 0) await capture({ name: "promo_applied", userId: input.userId, platform: input.platform, properties: { orderId: created.orderId } });
    if (created.status === "pending") {
      try {
        await capture({ name: "checkout_started", userId: input.userId, platform: input.platform, properties: { orderId: created.orderId } });
        if (input.paymentSheet) {
          const intent = await createPaymentIntent({
            amountCents: created.quote.studentPaysCents,
            applicationFeeCents: created.quote.platformFeeCents,
            destinationAccountId: created.teacher.stripeAccountId,
            customerEmail: input.email,
            metadata: { type: "order", orderId: created.orderId, userId: input.userId },
            statementDescriptor: statementDescriptor(created.teacher.studioName || "Studio", SHIP_DEFAULTS.statementDescriptorPrefix),
          });
          if (intent?.client_secret) {
            await db.update(orders).set({ stripePaymentIntentId: intent.id }).where(eq(orders.id, created.orderId));
            return { orderId: created.orderId, clientSecret: intent.client_secret, publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "", ...priceFields(created.quote) };
          }
        }
        const paths = checkoutPaths(input.returnToApp, "booking", `/bookings?paid=1`, `/c/${created.klass.slug}?cancelled=1`);
        const session = await createCheckout({
          name: created.klass.title,
          amountCents: created.quote.studentPaysCents,
          applicationFeeCents: created.quote.platformFeeCents,
          destinationAccountId: created.teacher.stripeAccountId,
          customerEmail: input.email,
          successPath: paths.successPath,
          cancelPath: paths.cancelPath,
          metadata: { type: "order", orderId: created.orderId, userId: input.userId },
          statementDescriptor: statementDescriptor(created.teacher.studioName || "Studio", SHIP_DEFAULTS.statementDescriptorPrefix),
        });
        if (session?.id) {
          await db.update(orders).set({ stripeCheckoutSessionId: session.id }).where(eq(orders.id, created.orderId));
          if (session.url) return { orderId: created.orderId, checkoutUrl: session.url, ...priceFields(created.quote) };
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
    await capture({ name: "checkout_completed", userId: input.userId, platform: input.platform, properties: { orderId: created.orderId, classId: created.klass.id, teacherId: created.teacher.id } });
    return { orderId: created.orderId, ...priceFields(created.quote) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not book." };
  }
}

export async function abandonFailedCheckout(orderId: string) {
  const now = new Date();
  const held = await db.select().from(bookings).where(and(eq(bookings.orderId, orderId), eq(bookings.status, "confirmed")));
  const links = held.length
    ? await db.select({ sessionId: bookingSessions.sessionId }).from(bookingSessions).where(inArray(bookingSessions.bookingId, held.map((booking) => booking.id)))
    : [];
  for (const booking of held) await releaseBookingSeat(booking, now);
  const visits = await db.select().from(visitBookings).where(and(eq(visitBookings.orderId, orderId), eq(visitBookings.status, "confirmed")));
  for (const visit of visits) await releaseVisitSeat(visit, now);
  await restoreStudioCreditForOrder(orderId, { scope: "abandon", sessionCount: 1, cancelledCount: 1, closeRemainder: true });
  await db.update(orders).set({ status: "cancelled", updatedAt: now }).where(and(eq(orders.id, orderId), eq(orders.status, "pending")));
  await db.update(promoRedemptions).set({ reversed: true }).where(eq(promoRedemptions.orderId, orderId));
  await db.update(packPurchases).set({ creditsRemaining: 0 }).where(eq(packPurchases.orderId, orderId));
  await db.update(membershipSubscriptions).set({ status: membershipStatusOnAbandon() }).where(eq(membershipSubscriptions.orderId, orderId));
  await offerOpenedSeats(links.map((link) => link.sessionId));
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
  const refundable = rows.filter((session) => shouldRestoreEntitlement(session.startsAt, now));
  if (refundable.length && booking.packPurchaseId) {
    const [purchase] = await db.select().from(packPurchases).where(eq(packPurchases.id, booking.packPurchaseId)).limit(1);
    if (purchase) {
      await db.update(packPurchases).set({ creditsRemaining: purchase.creditsRemaining + refundable.length }).where(eq(packPurchases.id, purchase.id));
      await db.insert(creditLedger).values({ id: crypto.randomUUID(), userId: booking.userId, bookingId: booking.id, sourceType: "pack", sourceId: purchase.id, direction: "restore" });
    }
  }
  if (refundable.length && booking.membershipSubscriptionId) {
    const [sub] = await db.select().from(membershipSubscriptions).where(eq(membershipSubscriptions.id, booking.membershipSubscriptionId)).limit(1);
    if (sub) {
      await db.update(membershipSubscriptions).set({ classesUsedThisPeriod: Math.max(0, sub.classesUsedThisPeriod - refundable.length) }).where(eq(membershipSubscriptions.id, sub.id));
      await db.insert(creditLedger).values({ id: crypto.randomUUID(), userId: booking.userId, bookingId: booking.id, sourceType: "membership", sourceId: sub.id, direction: "restore" });
    }
  }
  if (rows.every((session) => shouldRestoreEntitlement(session.startsAt, now))) {
    await db.update(introRedemptions).set({ restored: true }).where(and(eq(introRedemptions.bookingId, booking.id), eq(introRedemptions.restored, false)));
  }
}

export async function restoreStudioCreditForOrder(orderId: string, input: { scope: string; sessionCount: number; cancelledCount: number; closeRemainder: boolean }) {
  const spends = await db
    .select()
    .from(creditLedger)
    .where(and(eq(creditLedger.sourceType, "studio_credit"), eq(creditLedger.direction, "consume"), sql`${creditLedger.sourceId} like ${`order:${orderId}:%`}`));
  let applied = 0;
  let userId: string | null = null;
  let teacherId: string | null = null;
  let bookingId: string | null = null;
  for (const spend of spends) {
    const parsed = parseStudioCreditLedgerSource(spend.sourceId);
    if (!parsed || parsed.orderId !== orderId) continue;
    applied += parsed.appliedCents;
    userId = spend.userId;
    teacherId = spend.teacherId;
    bookingId = spend.bookingId;
  }
  if (!userId || !teacherId || applied <= 0) return 0;
  const restores = await db
    .select()
    .from(creditLedger)
    .where(and(eq(creditLedger.sourceType, "studio_credit"), eq(creditLedger.direction, "restore"), sql`${creditLedger.sourceId} like ${`%${orderId}%`}`));
  let already = 0;
  for (const row of restores) {
    if (row.sourceId.endsWith(`:${input.scope}`)) return 0;
    const current = parseStudioCreditLedgerSource(row.sourceId);
    if (current?.orderId === orderId) {
      already += current.appliedCents;
      continue;
    }
    const share = new RegExp(`^restore:${orderId}:(\\d+):`).exec(row.sourceId);
    if (share) already += Number(share[1]);
  }
  const give = studioCreditRestoreCents({
    appliedCents: applied,
    alreadyRestoredCents: already,
    sessionCount: input.sessionCount,
    cancelledCount: input.cancelledCount,
    closeRemainder: input.closeRemainder,
  });
  if (give <= 0) return 0;
  await grantStudioCredit(userId, teacherId, give);
  await db.insert(creditLedger).values({
    id: crypto.randomUUID(),
    userId,
    teacherId,
    bookingId,
    sourceType: "studio_credit",
    sourceId: `restore:${orderId}:${give}:${input.scope}`,
    direction: "restore",
  });
  return give;
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

export async function studentCancelPolicy(teacherId: string) {
  const [platform] = await db.select().from(platformSettings).limit(1);
  const [override] = teacherId ? await db.select().from(teacherPolicies).where(eq(teacherPolicies.teacherId, teacherId)).limit(1) : [];
  return resolvedPolicy(
    {
      fullRefundHours: platform?.studentFullRefundHours ?? SHIP_DEFAULTS.studentFullRefundHours,
      creditOnlyHours: platform?.studentCreditOnlyHours ?? SHIP_DEFAULTS.studentCreditOnlyHours,
      lateCancelFeeCents: platform?.lateCancelFeeCents ?? SHIP_DEFAULTS.lateCancelFeeCents,
      noShowFeeCents: platform?.noShowFeeCents ?? SHIP_DEFAULTS.noShowFeeCents,
    },
    override ?? null,
  );
}

export async function cancelBooking(userId: string, bookingId: string) {
  const now = new Date();
  const [booking] = await db.select().from(bookings).where(and(eq(bookings.id, bookingId), eq(bookings.userId, userId))).limit(1);
  if (!booking || booking.status !== "confirmed") return { error: "Booking not found." };
  const links = await db.select().from(bookingSessions).where(eq(bookingSessions.bookingId, booking.id));
  const rows = links.length ? await db.select().from(sessions).where(inArray(sessions.id, links.map((link) => link.sessionId))) : [];
  const upcoming = rows.filter((session) => session.startsAt > now).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const startsAt = nextUpcomingStart(rows.map((session) => session.startsAt), now);
  if (!startsAt) return { error: "This class has already started." };
  const [klass] = await db.select().from(classes).where(eq(classes.id, booking.classId)).limit(1);
  const policy = await studentCancelPolicy(klass?.teacherId ?? "");
  const outcome = studentCancelOutcome({ now, startsAt, fullRefundHours: policy.fullRefundHours, creditOnlyHours: policy.creditOnlyHours });
  const fee = lateCancelFee({ outcome, lateCancelFeeCents: policy.lateCancelFeeCents });
  await releaseBookingSeat(booking, now);
  const sessionCount = Math.max(1, rows.length);
  const cancelledCount = upcoming.length;
  if (booking.orderId && (outcome === "full_refund" || outcome === "credit")) {
    await restoreStudioCreditForOrder(booking.orderId, {
      scope: `student-${booking.id}`,
      sessionCount,
      cancelledCount,
      closeRemainder: cancelledCount >= rows.length,
    });
  }
  if (booking.orderId && outcome === "full_refund") {
    await issueRefund({
      orderId: booking.orderId,
      reasonCode: "student_cancel",
      actorUserId: userId,
      scope: booking.id,
      sessionCount,
      cancelledCount,
    });
  } else if (booking.orderId && outcome === "credit" && klass) {
    const [order] = await db.select().from(orders).where(eq(orders.id, booking.orderId)).limit(1);
    if (order) {
      const share = seriesProrate({
        studentPaysCents: order.studentPaysCents,
        platformFeeCents: order.platformFeeCents,
        teacherAmountCents: order.teacherAmountCents,
        sessionCount,
        cancelledCount,
        alreadyRefundedCents: order.refundedCents,
      });
      const applied = await consumeRefundableCash(order.id, share.refundCents);
      if (applied > 0) await grantStudioCredit(userId, klass.teacherId, applied);
    }
  }
  if (klass) {
    const refunded = outcome === "full_refund";
    const attendedRemain = rows.some((session) => session.startsAt <= now);
    await emitNotification({
      userId,
      event: refunded ? "booking.refunded" : "booking.cancelled",
      audience: "student",
      title: `Cancelled ${klass.title}`,
      body: refunded ? (attendedRemain ? "A refund for the sessions you have not attended is on the way." : "A full refund is on the way to your original payment method.") : outcome === "credit" ? "Studio credit was added to your account." : fee ? `No refund. A late cancel fee of $${(fee / 100).toFixed(2)} may apply.` : "This cancellation is outside the refund window.",
      href: `/c/${klass.slug}`,
      textEligible: outcome !== "full_refund" && sameLocalDay(upcoming[0]!.startsAt, now),
    });
    const { capture } = await import("@/lib/analytics");
    await capture({ name: "booking_cancelled", userId, properties: { bookingId, classId: klass.id } });
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
  await offerOpenedSeats(rows.map((session) => session.id));
  return { ok: true, outcome, feeCents: fee };
}

export async function rescheduleBooking(userId: string, bookingId: string, sessionId: string) {
  try {
    return await db.transaction(async (tx) => {
      const [booking] = await tx.select().from(bookings).where(and(eq(bookings.id, bookingId), eq(bookings.userId, userId), eq(bookings.status, "confirmed"))).limit(1);
      if (!booking) return { error: "Booking not found." };
      const links = await tx.select().from(bookingSessions).where(eq(bookingSessions.bookingId, booking.id));
      if (links.length !== 1) return { error: "Move one date at a time." };
      const link = links[0]!;
      await tx.execute(sql`select id from booking_sessions where id = ${link.id} for update`);
      const [freshLink] = await tx.select().from(bookingSessions).where(eq(bookingSessions.id, link.id)).limit(1);
      const [current] = await tx.select().from(sessions).where(eq(sessions.id, link.sessionId)).limit(1);
      if (!freshLink || !current || freshLink.checkedIn || current.startsAt <= new Date()) return { error: "That date has already been used." };
      await tx.execute(sql`select id from sessions where id = ${sessionId} for update`);
      const [next] = await tx.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
      if (!next || next.classId !== booking.classId || next.status !== "scheduled" || next.startsAt <= new Date()) return { error: "That date is not open." };
      if (link.sessionId === next.id) return { ok: true as const };
      const taken = await confirmedCount(next.id, tx as unknown as typeof db);
      if (taken >= next.capacity) return { error: "That date is full." };
      await tx.update(bookingSessions).set({ sessionId: next.id }).where(and(eq(bookingSessions.bookingId, booking.id), eq(bookingSessions.sessionId, link.sessionId)));
      return { ok: true as const };
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not move that date." };
  }
}

async function recordOfferMoney(userId: string, orderId: string, kind: string) {
  const { capture } = await import("@/lib/analytics");
  await capture({ name: "checkout_completed", userId, properties: { orderId, kind } });
  if (kind === "pack" || kind === "membership") await capture({ name: "offer_purchased", userId, properties: { orderId, kind } });
}

export async function fulfillPaidCheckout(orderId: string, paymentIntent: string | null, subscriptionId: string | null) {
  const updated = await db
    .update(orders)
    .set({ status: "paid", stripePaymentIntentId: paymentIntent, stripeSubscriptionId: subscriptionId, updatedAt: new Date() })
    .where(and(eq(orders.id, orderId), eq(orders.status, "pending")))
    .returning();
  if (!updated.length) return;
  const order = updated[0]!;
  if (order.userId) await recordOfferMoney(order.userId, order.id, order.kind);
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
    await sendAcknowledgmentForOrder(order.id);
  }
    if ((order.kind === "pack" || order.kind === "membership") && order.teacherId) {
      const [teacher] = await db.select().from(teachers).where(eq(teachers.id, order.teacherId)).limit(1);
      if (teacher) await notifyOfferPurchased({ teacherUserId: teacher.userId, title: order.kind, href: "/teach/billing" });
    }
  if (paidCheckoutSendsBookingEmail(order.kind) && order.userId) {
    const [person] = await db.select({ email: user.email, name: user.name }).from(user).where(eq(user.id, order.userId)).limit(1);
    let klass: typeof classes.$inferSelect | undefined;
    if (person?.email && order.kind === "visit") {
      const [visit] = await db.select().from(visitBookings).where(eq(visitBookings.orderId, order.id)).limit(1);
      const [service] = visit ? await db.select().from(services).where(eq(services.id, visit.serviceId)).limit(1) : [];
      if (service) {
        await sendEmail({
          to: [person.email],
          subject: `You're booked: ${service.title}`,
          text: "Your spot is reserved.",
          teacherId: order.teacherId ?? undefined,
        });
        if (paidCheckoutEmitsBookingNotifications(order.kind)) {
          const [teacher] = order.teacherId ? await db.select().from(teachers).where(eq(teachers.id, order.teacherId)).limit(1) : [];
          if (teacher) await notifyTeacherOfBooking({ teacherUserId: teacher.userId, studentName: person.name || "A student", title: service.title, href: "/teach" });
          await notifyStudentConfirmed({ userId: order.userId, title: service.title, href: `/s/${service.slug}` });
        }
      }
    } else {
      const [booking] = await db.select().from(bookings).where(eq(bookings.orderId, order.id)).limit(1);
      const [found] = booking ? await db.select().from(classes).where(eq(classes.id, booking.classId)).limit(1) : [];
      klass = found;
      if (person?.email && klass) {
        await sendEmail({
          to: [person.email],
          subject: `You're booked: ${klass.title}`,
          text: "Your spot is reserved.",
          teacherId: order.teacherId ?? undefined,
        });
      }
    }
    if (paidCheckoutEmitsBookingNotifications(order.kind) && klass) {
      const [teacher] = order.teacherId ? await db.select().from(teachers).where(eq(teachers.id, order.teacherId)).limit(1) : [];
      if (teacher) await notifyTeacherOfBooking({ teacherUserId: teacher.userId, studentName: person?.name || "A student", title: klass.title, href: "/teach" });
      await notifyStudentConfirmed({ userId: order.userId, title: klass.title, href: `/c/${klass.slug}` });
    }
  }
}

export async function renewMembershipFromInvoice(input: {
  subscriptionId: string;
  invoiceId: string;
  billingReason: string | null;
  amountPaidCents: number;
  paymentIntentId: string | null;
  periodStart: Date;
  periodEnd: Date;
}) {
  const orderId = `renewal:${input.invoiceId}`;
  const [already] = await db.select({ id: orders.id }).from(orders).where(eq(orders.id, orderId)).limit(1);
  if (already) return { extended: false };
  const linked = await db.select().from(orders).where(eq(orders.stripeSubscriptionId, input.subscriptionId));
  const original = linked.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
  if (!original) return { extended: false };
  const [sub] = await db.select().from(membershipSubscriptions).where(eq(membershipSubscriptions.orderId, original.id)).limit(1);
  if (!sub) return { extended: false };
  if (sub.cancelAtPeriodEnd || sub.status === "cancelled") return { extended: false };
  if (!membershipRenewalExtendsAccess({ billingReason: input.billingReason, currentPeriodEnd: sub.currentPeriodEnd, invoicePeriodEnd: input.periodEnd })) {
    return { extended: false };
  }
  const money = renewalChargeSplit(original, input.amountPaidCents);
  await db.insert(orders).values({
    id: orderId,
    userId: original.userId,
    teacherId: original.teacherId,
    kind: "membership",
    status: "paid",
    listPriceCents: money.listPriceCents,
    discountCents: money.discountCents,
    studentPaysCents: money.studentPaysCents,
    platformFeeCents: money.platformFeeCents,
    teacherAmountCents: money.teacherAmountCents,
    platformFundedCents: 0,
    teacherFundedCents: 0,
    platformLiabilityCents: 0,
    paymentPath: "card",
    stripePaymentIntentId: input.paymentIntentId,
    stripeSubscriptionId: input.subscriptionId,
  });
  await db.update(membershipSubscriptions).set({
    status: membershipStatusOnPayment(),
    currentPeriodStart: input.periodStart,
    currentPeriodEnd: input.periodEnd,
    classesUsedThisPeriod: 0,
  }).where(eq(membershipSubscriptions.id, sub.id));
  return { extended: true };
}

export async function releaseSeatsForRefundedOrder(orderId: string, now = new Date()) {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) return;
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

export async function refundOrderByPaymentIntent(intent: string, fullyRefunded = true) {
  if (!chargeRefundReleasesSeats(fullyRefunded)) return;
  const now = new Date();
  await db
    .update(orders)
    .set({ status: "refunded", refundedCents: sql`${orders.studentPaysCents}`, updatedAt: now })
    .where(and(
      eq(orders.stripePaymentIntentId, intent),
      or(ne(orders.status, "refunded"), sql`${orders.refundedCents} < ${orders.studentPaysCents}`),
    ));
  const targets = await db.select().from(orders).where(and(eq(orders.stripePaymentIntentId, intent), eq(orders.status, "refunded")));
  for (const order of targets) await releaseSeatsForRefundedOrder(order.id, now);
}

async function lockPromo(
  tx: Pick<typeof db, "execute" | "select">,
  promo: typeof promoCodes.$inferSelect,
  userId: string,
  now: Date,
  listPriceCents: number,
  product: ProductScope,
) {
  await tx.execute(sql`select id from promo_codes where id = ${promo.id} for update`);
  const [totals] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(promoRedemptions)
    .where(and(eq(promoRedemptions.promoCodeId, promo.id), eq(promoRedemptions.reversed, false)));
  const [mine] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(promoRedemptions)
    .where(and(eq(promoRedemptions.promoCodeId, promo.id), eq(promoRedemptions.userId, userId), eq(promoRedemptions.reversed, false)));
  const verdict = validatePromo({
    promo: toRule(promo),
    now,
    listPriceCents,
    totalRedemptions: Number(totals?.count ?? 0),
    customerRedemptions: Number(mine?.count ?? 0),
    isFirstTimeStudent: !(await priorWithTeacher(userId, product.teacherId ?? "")),
    product,
  });
  if (!verdict.ok) throw new Error(verdict.reason);
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

export async function purchaseOffer(input: { userId: string; email: string; kind: "pack" | "membership"; id: string; code?: string; paymentSheet?: boolean; returnToApp?: boolean; consent?: boolean; disclosureVersion?: string; platform?: string; ip?: string | null; userAgent?: string | null; appVersion?: string | null }): Promise<{ error?: string; ok?: boolean; orderId?: string; checkoutUrl?: string; clientSecret?: string; publishableKey?: string; listPriceCents?: number; discountCents?: number; studentPaysCents?: number; codeApplied?: string | null; disclosure?: ReturnType<typeof disclosurePayload> }> {
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
    try {
      await db.transaction(async (tx) => {
        if (promo) await lockPromo(tx, promo, input.userId, now, pack.priceCents, { kind: "pack", teacherId: pack.teacherId, packId: pack.id });
        await tx.insert(orders).values({
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
        if (promo) {
          await tx.insert(promoRedemptions).values({
            id: crypto.randomUUID(),
            promoCodeId: promo.id,
            userId: input.userId,
            orderId,
            discountCents: quote.discountCents,
            platformFundedCents: quote.platformFundedCents,
            teacherFundedCents: quote.teacherFundedCents,
          });
        }
        await tx.insert(packPurchases).values({
          id: purchaseId,
          orderId,
          userId: input.userId,
          packId: pack.id,
          teacherId: pack.teacherId,
          creditsTotal: pack.creditCount,
          creditsRemaining: packCreditsOnCreate({ awaitingCardPayment: status === "pending", creditCount: pack.creditCount }),
          expiresAt: new Date(now.getTime() + pack.expiryDays * 86_400_000),
        });
      });
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Could not buy." };
    }
    if (status === "pending" && teacher && input.paymentSheet) {
      const intent = await createPaymentIntent({
        amountCents: quote.studentPaysCents,
        applicationFeeCents: money.platformFeeCents,
        destinationAccountId: teacher.stripeAccountId,
        customerEmail: input.email,
        metadata: { type: "order", orderId, userId: input.userId },
        statementDescriptor: statementDescriptor(teacher.studioName || "Studio", SHIP_DEFAULTS.statementDescriptorPrefix),
      });
      if (intent?.client_secret) {
        await db.update(orders).set({ stripePaymentIntentId: intent.id }).where(eq(orders.id, orderId));
        return { orderId, clientSecret: intent.client_secret, publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "", ...priceFields(quote) };
      }
    }
    if (status === "pending" && teacher) {
      const paths = checkoutPaths(input.returnToApp, "pack", "/bookings?pack=1", `/t/${teacher.slug}`);
      try {
        const session = await createCheckout({
          name: pack.name,
          amountCents: quote.studentPaysCents,
          applicationFeeCents: money.platformFeeCents,
          destinationAccountId: teacher.stripeAccountId,
          customerEmail: input.email,
          successPath: paths.successPath,
          cancelPath: paths.cancelPath,
          metadata: { type: "order", orderId, userId: input.userId },
          statementDescriptor: statementDescriptor(teacher.studioName || "Studio", SHIP_DEFAULTS.statementDescriptorPrefix),
        });
        if (session?.url) {
          await db.update(orders).set({ stripeCheckoutSessionId: session.id }).where(eq(orders.id, orderId));
          return { orderId, checkoutUrl: session.url, ...priceFields(quote) };
        }
      } catch (error) {
        await abandonFailedCheckout(orderId);
        return { error: error instanceof Error ? error.message : "Could not start checkout." };
      }
      const offline = orderMoney(quote, false);
      await db.update(orders).set({ status: "pay_at_studio", platformFeeCents: offline.platformFeeCents, teacherAmountCents: offline.teacherAmountCents, platformLiabilityCents: offline.platformLiabilityCents }).where(eq(orders.id, orderId));
      await db.update(packPurchases).set({ creditsRemaining: packCreditsOnPayment(pack.creditCount) }).where(eq(packPurchases.id, purchaseId));
    }
    if (status !== "pending") {
      await recordOfferMoney(input.userId, orderId, "pack");
      await notifyOfferPurchased({ teacherUserId: teacher.userId, title: pack.name, href: "/teach/billing" });
    }
    return { ok: true, orderId, ...priceFields(quote) };
  }
  const [plan] = await db.select().from(memberships).where(eq(memberships.id, input.id)).limit(1);
  if (!plan || !plan.active) return { error: "That membership is unavailable." };
  const [teacher] = await db.select().from(teachers).where(eq(teachers.id, plan.teacherId)).limit(1);
  if (!teacher || !studioCanSell(teacher.status)) return { error: "This teacher isn't bookable yet." };
  const offer = membershipOffer({ priceCents: plan.priceCents, termMonths: plan.termMonths, recurring: plan.recurring, introDays: plan.introDays, introPriceCents: plan.introPriceCents, now });
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
        listPriceCents: offer.todayCents,
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
  const prepared = await disclosureForMembership(plan.id, now);
  if (plan.recurring) {
    if (!prepared) return { error: "That membership is unavailable." };
    const verdict = consentAccepted({ recurring: true, consent: input.consent === true, disclosureVersion: input.disclosureVersion || "", expectedVersion: prepared.disclosure.version });
    if (!verdict.ok) return { error: verdict.error, disclosure: disclosurePayload(prepared.disclosure) };
  }
  const quote = quotePrice({ listPriceCents: offer.todayCents, feePercent: fee.feePercent, feeFixedCents: fee.feeFixedCents, promo: promo ? toRule(promo) : null });
  const planReady = cardPaymentsReady({ stripeOn: stripeConfigured(), chargesEnabled: Boolean(teacher.stripeChargesEnabled) });
  if ((quote.studentPaysCents > 0 || offer.chargeLater) && !planReady.ok) return { error: planReady.reason };
  const orderId = crypto.randomUUID();
  const subId = crypto.randomUUID();
  const online = collectsOnline(quote.studentPaysCents, stripeConfigured()) || offer.chargeLater;
  const money = orderMoney(quote, online);
  const status = offer.chargeLater ? "pending" : quote.studentPaysCents === 0 ? "paid" : online ? "pending" : "pay_at_studio";
  const periodEnd = offer.periodEnd;
  try {
    await db.transaction(async (tx) => {
      if (promo) await lockPromo(tx, promo, input.userId, now, offer.todayCents, { kind: "membership", teacherId: plan.teacherId, membershipId: plan.id });
      await tx.insert(orders).values({
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
      if (promo) {
        await tx.insert(promoRedemptions).values({
          id: crypto.randomUUID(),
          promoCodeId: promo.id,
          userId: input.userId,
          orderId,
          discountCents: quote.discountCents,
          platformFundedCents: quote.platformFundedCents,
          teacherFundedCents: quote.teacherFundedCents,
        });
      }
      await tx.insert(membershipSubscriptions).values({
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
        renewalPriceCents: offer.renewalCents,
        introEndsAt: offer.intro ? offer.periodEnd : null,
        cardBrand: "card",
        cardLast4: "••••",
      });
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not buy." };
  }
  if (plan.recurring && prepared) {
    await recordRenewalConsent({
      userId: input.userId,
      membershipId: plan.id,
      teacherId: plan.teacherId,
      subscriptionId: subId,
      orderId,
      disclosure: prepared.disclosure,
      ip: input.ip,
      userAgent: input.userAgent,
      platform: input.platform || (input.returnToApp ? "app" : "web"),
      appVersion: input.appVersion,
    });
  }
  if (status === "pending" && teacher) {
    const paths = checkoutPaths(input.returnToApp, "membership", "/bookings?membership=1", `/t/${teacher.slug}`);
    const renewalQuote = quotePrice({ listPriceCents: offer.renewalCents, feePercent: fee.feePercent, feeFixedCents: fee.feeFixedCents, promo: null });
    const checkoutAmount = offer.intro ? offer.renewalCents : quote.studentPaysCents;
    const checkoutFee = offer.intro ? orderMoney(renewalQuote, true).platformFeeCents : money.platformFeeCents;
    let session: { id: string; url: string | null } | null = null;
    try {
      session = await createCheckout({
        name: plan.name,
        amountCents: checkoutAmount,
        applicationFeeCents: checkoutFee,
        destinationAccountId: teacher.stripeAccountId,
        customerEmail: input.email,
        successPath: paths.successPath,
        cancelPath: paths.cancelPath,
        metadata: { type: "order", orderId, userId: input.userId },
        statementDescriptor: statementDescriptor(teacher.studioName || "Studio", SHIP_DEFAULTS.statementDescriptorPrefix),
        recurring: plan.recurring ? { interval: "month", intervalCount: plan.termMonths, trialPeriodDays: offer.trialDays || undefined } : null,
        oneTimeAmountCents: offer.intro && quote.studentPaysCents > 0 ? quote.studentPaysCents : undefined,
      });
    } catch (error) {
      await abandonFailedCheckout(orderId);
      return { error: error instanceof Error ? error.message : "Could not start checkout." };
    }
    if (session?.url) {
      await db.update(orders).set({ stripeCheckoutSessionId: session.id, status: "pending" }).where(eq(orders.id, orderId));
      return { orderId, checkoutUrl: session.url, ...priceFields(quote) };
    }
    if (offer.chargeLater) {
      await abandonFailedCheckout(orderId);
      return { error: "Add a card so the membership can renew after the intro." };
    }
    const offline = orderMoney(quote, false);
    await db.update(orders).set({ status: "pay_at_studio", platformFeeCents: offline.platformFeeCents, teacherAmountCents: offline.teacherAmountCents, platformLiabilityCents: offline.platformLiabilityCents }).where(eq(orders.id, orderId));
    await db.update(membershipSubscriptions).set({ status: membershipStatusOnPayment() }).where(eq(membershipSubscriptions.id, subId));
  }
  if (status !== "pending") {
    await recordOfferMoney(input.userId, orderId, "membership");
    await notifyOfferPurchased({ teacherUserId: teacher.userId, title: plan.name, href: "/teach/billing" });
    await sendAcknowledgmentForOrder(orderId);
  }
  return { ok: true, orderId, ...priceFields(quote) };
}
