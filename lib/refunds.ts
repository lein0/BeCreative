import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditLog, orders, packPurchases, promoRedemptions, refundLedger, studioCredits } from "@/lib/db/schema";
import { partialRefundRemaining, pendingStripeMarker, promoReversesOnRefund, refundCashAlreadyReserved, refundIdempotencyKey, refundLedgerStatus, refundReplayIsSuccess, refundReserveFailed, reservedStripeMarker, seriesProrate, nextStripeRefundKey, studioCreditRestoreForPostedRefund } from "@/lib/refund-math";
import { getStripe } from "@/lib/stripe";

export async function issueRefund(input: {
  orderId: string;
  amountCents?: number;
  sessionCount?: number;
  cancelledCount?: number;
  reasonCode: string;
  actorUserId?: string | null;
  scope?: string;
}) {
  const [order] = await db.select().from(orders).where(eq(orders.id, input.orderId)).limit(1);
  if (!order) return { error: "Order not found." };
  const prorated = input.sessionCount && input.cancelledCount
    ? seriesProrate({
        studentPaysCents: order.studentPaysCents,
        platformFeeCents: order.platformFeeCents,
        teacherAmountCents: order.teacherAmountCents,
        sessionCount: input.sessionCount,
        cancelledCount: input.cancelledCount,
        alreadyRefundedCents: order.refundedCents,
      })
    : null;
  const requested = prorated?.refundCents ?? input.amountCents ?? Math.max(0, order.studentPaysCents - order.refundedCents);
  const amountCents = partialRefundRemaining(order.studentPaysCents, order.refundedCents, requested);
  if (amountCents <= 0 && order.studentPaysCents > 0) return { error: "Nothing left to refund.", amountCents: 0 };
  const key = refundIdempotencyKey(order.id, amountCents, input.reasonCode, input.scope ?? "");
  const [existing] = await db.select().from(refundLedger).where(eq(refundLedger.idempotencyKey, key)).limit(1);
  if (existing && refundReplayIsSuccess(existing.status)) return { ok: true, replayed: true, refundId: existing.id, amountCents: existing.amountCents };
  const feeReversed = prorated?.feeReversedCents ?? (order.studentPaysCents > 0 ? Math.round(order.platformFeeCents * (amountCents / order.studentPaysCents)) : 0);
  const transferReversed = prorated?.transferReversedCents ?? (order.studentPaysCents > 0 ? Math.round(order.teacherAmountCents * (amountCents / order.studentPaysCents)) : 0);
  const stripeKey = nextStripeRefundKey({
    ledgerKey: key,
    status: existing?.status ?? "new",
    pendingMarker: existing?.stripeRefundId ?? null,
    retryNonce: crypto.randomUUID(),
  });
  const id = existing?.id ?? crypto.randomUUID();
  if (!existing) {
    try {
      await db.insert(refundLedger).values({
        id,
        orderId: order.id,
        amountCents,
        feeReversedCents: feeReversed,
        transferReversedCents: transferReversed,
        reasonCode: input.reasonCode,
        actorUserId: input.actorUserId,
        idempotencyKey: key,
        status: "pending",
        stripeRefundId: order.stripePaymentIntentId && amountCents > 0 ? pendingStripeMarker(stripeKey) : null,
      });
    } catch (error) {
      const [raced] = await db.select().from(refundLedger).where(eq(refundLedger.idempotencyKey, key)).limit(1);
      if (raced && refundReplayIsSuccess(raced.status)) return { ok: true, replayed: true, refundId: raced.id, amountCents: raced.amountCents };
      if (raced) return { error: "Refund is already in progress." };
      throw error;
    }
  } else if (existing.status === "failed") {
    const claimed = await db
      .update(refundLedger)
      .set({ status: "pending", stripeRefundId: pendingStripeMarker(stripeKey) })
      .where(and(eq(refundLedger.id, existing.id), eq(refundLedger.status, "failed")))
      .returning();
    if (!claimed.length) return { error: "Refund is already in progress." };
  }
  const reservationMarker = existing?.status === "failed" ? pendingStripeMarker(stripeKey) : existing?.stripeRefundId ?? null;
  const alreadyReserved = amountCents > 0 && refundCashAlreadyReserved(reservationMarker);
  if (amountCents > 0 && !alreadyReserved) {
    let reserved = 0;
    try {
      reserved = await db.transaction(async (tx) => {
        const taken = await reserveRefundableCash(order.id, amountCents, tx);
        if (refundReserveFailed(taken, amountCents)) return taken;
        const marked = await tx
          .update(refundLedger)
          .set({ stripeRefundId: reservedStripeMarker(stripeKey) })
          .where(and(eq(refundLedger.id, id), eq(refundLedger.status, "pending")))
          .returning({ id: refundLedger.id });
        if (!marked.length) throw new Error("Refund is already in progress.");
        return taken;
      });
    } catch (error) {
      if (error instanceof Error && error.message === "Refund is already in progress.") return { error: "Refund is already in progress." };
      throw error;
    }
    if (refundReserveFailed(reserved, amountCents)) {
      await db.update(refundLedger).set({ status: "failed", stripeRefundId: null }).where(and(eq(refundLedger.id, id), eq(refundLedger.status, "pending")));
      return { error: "Nothing left to refund.", amountCents: 0 };
    }
  }
  let stripeRefundId: string | null = null;
  if (order.stripePaymentIntentId && amountCents > 0) {
    const stripe = getStripe();
    if (!stripe) {
      await releaseRefundableCash(order.id, amountCents);
      await db.update(refundLedger).set({ status: "failed" }).where(eq(refundLedger.id, id));
      return { error: "Card refund was not sent to Stripe." };
    }
    try {
      const refund = await stripe.refunds.create(
        {
          payment_intent: order.stripePaymentIntentId,
          amount: amountCents,
          refund_application_fee: feeReversed > 0,
          reverse_transfer: transferReversed > 0,
          metadata: { orderId: order.id, reason: input.reasonCode },
        },
        { idempotencyKey: stripeKey },
      );
      stripeRefundId = refund.id;
    } catch (error) {
      await releaseRefundableCash(order.id, amountCents);
      await db.update(refundLedger).set({ status: "failed" }).where(eq(refundLedger.id, id));
      return { error: error instanceof Error ? error.message : "Stripe refund failed." };
    }
  }
  const postedStatus = refundLedgerStatus({
    amountCents,
    hasPaymentIntent: Boolean(order.stripePaymentIntentId),
    stripeRefundId,
  });
  if (postedStatus === "failed") {
    await releaseRefundableCash(order.id, amountCents);
    await db.update(refundLedger).set({ status: "failed" }).where(eq(refundLedger.id, id));
    return { error: "Card refund was not sent to Stripe." };
  }
  const posted = await db.transaction(async (tx) => {
    const marked = await tx
      .update(refundLedger)
      .set({ status: postedStatus, stripeRefundId })
      .where(and(eq(refundLedger.id, id), eq(refundLedger.status, "pending")))
      .returning();
    if (!marked.length) return false;
    const [fresh] = await tx.select({
      refundedCents: orders.refundedCents,
      studentPaysCents: orders.studentPaysCents,
      promoCodeId: orders.promoCodeId,
    }).from(orders).where(eq(orders.id, order.id)).limit(1);
    const full = promoReversesOnRefund({
      refundCents: amountCents,
      studentPaysCents: fresh?.studentPaysCents ?? order.studentPaysCents,
      alreadyRefundedCents: Math.max(0, (fresh?.refundedCents ?? amountCents) - amountCents),
    });
    if (full) {
      await tx.update(orders).set({ status: "refunded", updatedAt: new Date() }).where(eq(orders.id, order.id));
      if (fresh?.promoCodeId) {
        await tx.update(promoRedemptions).set({ reversed: true }).where(and(eq(promoRedemptions.orderId, order.id), eq(promoRedemptions.reversed, false)));
      }
    }
    return { full };
  });
  if (!posted) {
    const [again] = await db.select().from(refundLedger).where(eq(refundLedger.id, id)).limit(1);
    if (again && refundReplayIsSuccess(again.status)) return { ok: true, replayed: true, refundId: again.id, amountCents: again.amountCents };
    return { error: "Refund is already in progress." };
  }
  const full = posted.full;
  if (full) {
    const { releaseSeatsForRefundedOrder, restoreStudioCreditForOrder } = await import("@/lib/booking-service");
    await releaseSeatsForRefundedOrder(order.id);
    const credit = studioCreditRestoreForPostedRefund({ full, orderId: order.id });
    if (credit) await restoreStudioCreditForOrder(order.id, credit);
  }
  await db.insert(auditLog).values({
    id: crypto.randomUUID(),
    actorUserId: input.actorUserId,
    action: "refund.issue",
    entityType: "order",
    entityId: order.id,
    summary: `${input.reasonCode} · ${(amountCents / 100).toFixed(2)}`,
  });
  return { ok: true, replayed: false, refundId: id, amountCents, full, feeReversed, transferReversed };
}

/** A studio-credit substitution spends the same cash so a later card refund cannot pay it again. */
export async function consumeRefundableCash(orderId: string, amountCents: number): Promise<number> {
  const requested = Math.max(0, Math.trunc(amountCents));
  if (requested <= 0) return 0;
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) return 0;
  const applied = Math.min(requested, Math.max(0, order.studentPaysCents - order.refundedCents));
  if (applied <= 0) return 0;
  const updated = await db
    .update(orders)
    .set({ refundedCents: order.refundedCents + applied, updatedAt: new Date() })
    .where(and(eq(orders.id, order.id), eq(orders.refundedCents, order.refundedCents)))
    .returning({ refundedCents: orders.refundedCents });
  if (!updated.length) return consumeRefundableCash(orderId, requested);
  return applied;
}

export async function grantStudioCredit(userId: string, teacherId: string, amountCents: number) {
  const amount = Math.trunc(amountCents);
  if (amount === 0) return;
  await db
    .insert(studioCredits)
    .values({ id: crypto.randomUUID(), userId, teacherId, balanceCents: amount })
    .onConflictDoUpdate({
      target: [studioCredits.userId, studioCredits.teacherId],
      set: { balanceCents: sql`${studioCredits.balanceCents} + ${amount}` },
    });
}

/** Exact cash reservation. Adds to the current refunded total, or returns 0 when that cash is already gone. */
export async function reserveRefundableCash(orderId: string, amountCents: number, store: Pick<typeof db, "select" | "update"> = db): Promise<number> {
  const amount = Math.max(0, Math.trunc(amountCents));
  if (amount <= 0) return 0;
  const [order] = await store.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) return 0;
  if (order.refundedCents + amount > order.studentPaysCents) return 0;
  const updated = await store
    .update(orders)
    .set({ refundedCents: sql`${orders.refundedCents} + ${amount}`, updatedAt: new Date() })
    .where(and(
      eq(orders.id, order.id),
      eq(orders.refundedCents, order.refundedCents),
      sql`${orders.refundedCents} + ${amount} <= ${orders.studentPaysCents}`,
    ))
    .returning({ refundedCents: orders.refundedCents });
  if (!updated.length) return reserveRefundableCash(orderId, amount, store);
  return amount;
}

export async function releaseRefundableCash(orderId: string, amountCents: number) {
  const amount = Math.max(0, Math.trunc(amountCents));
  if (amount <= 0) return;
  await db
    .update(orders)
    .set({ refundedCents: sql`greatest(0, ${orders.refundedCents} - ${amount})`, updatedAt: new Date() })
    .where(eq(orders.id, orderId));
}

export async function restorePackCredits(purchaseId: string, count: number) {
  if (count <= 0) return;
  const [purchase] = await db.select().from(packPurchases).where(eq(packPurchases.id, purchaseId)).limit(1);
  if (!purchase) return;
  await db.update(packPurchases).set({ creditsRemaining: purchase.creditsRemaining + count }).where(eq(packPurchases.id, purchase.id));
}
