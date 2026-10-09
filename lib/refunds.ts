import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditLog, orders, packPurchases, promoRedemptions, refundLedger, studioCredits } from "@/lib/db/schema";
import { partialRefundRemaining, pendingStripeMarker, promoReversesOnRefund, refundIdempotencyKey, refundReplayIsSuccess, seriesProrate, nextStripeRefundKey } from "@/lib/refund-math";
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
  let stripeRefundId: string | null = null;
  if (order.stripePaymentIntentId && amountCents > 0) {
    const stripe = getStripe();
    if (stripe) {
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
        await db.update(refundLedger).set({ status: "failed" }).where(eq(refundLedger.id, id));
        return { error: error instanceof Error ? error.message : "Stripe refund failed." };
      }
    }
  }
  const postedStatus = stripeRefundId || amountCents === 0 ? "posted" : order.stripePaymentIntentId ? "posted" : "offline";
  const posted = await db.transaction(async (tx) => {
    const marked = await tx
      .update(refundLedger)
      .set({ status: postedStatus, stripeRefundId })
      .where(and(eq(refundLedger.id, id), eq(refundLedger.status, "pending")))
      .returning();
    if (!marked.length) return false;
    const refundedCents = order.refundedCents + amountCents;
    const full = promoReversesOnRefund({ refundCents: amountCents, studentPaysCents: order.studentPaysCents, alreadyRefundedCents: order.refundedCents });
    await tx.update(orders).set({
      refundedCents,
      status: full ? "refunded" : order.status,
      updatedAt: new Date(),
    }).where(eq(orders.id, order.id));
    if (full && order.promoCodeId) {
      await tx.update(promoRedemptions).set({ reversed: true }).where(and(eq(promoRedemptions.orderId, order.id), eq(promoRedemptions.reversed, false)));
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
    const { releaseSeatsForRefundedOrder } = await import("@/lib/booking-service");
    await releaseSeatsForRefundedOrder(order.id);
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
  const [existing] = await db.select().from(studioCredits).where(and(eq(studioCredits.userId, userId), eq(studioCredits.teacherId, teacherId))).limit(1);
  if (!existing) {
    await db.insert(studioCredits).values({ id: crypto.randomUUID(), userId, teacherId, balanceCents: amountCents });
    return;
  }
  await db.update(studioCredits).set({ balanceCents: existing.balanceCents + amountCents }).where(eq(studioCredits.id, existing.id));
}

export async function restorePackCredits(purchaseId: string, count: number) {
  if (count <= 0) return;
  const [purchase] = await db.select().from(packPurchases).where(eq(packPurchases.id, purchaseId)).limit(1);
  if (!purchase) return;
  await db.update(packPurchases).set({ creditsRemaining: purchase.creditsRemaining + count }).where(eq(packPurchases.id, purchase.id));
}
