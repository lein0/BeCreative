import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditLog, orders, packPurchases, promoRedemptions, refundLedger, studioCredits } from "@/lib/db/schema";
import { partialRefundRemaining, promoReversesOnRefund, refundIdempotencyKey, seriesProrate } from "@/lib/refund-math";
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
  if (existing) return { ok: true, replayed: true, refundId: existing.id, amountCents: existing.amountCents };
  const feeReversed = prorated?.feeReversedCents ?? (order.studentPaysCents > 0 ? Math.round(order.platformFeeCents * (amountCents / order.studentPaysCents)) : 0);
  const transferReversed = prorated?.transferReversedCents ?? (order.studentPaysCents > 0 ? Math.round(order.teacherAmountCents * (amountCents / order.studentPaysCents)) : 0);
  const id = crypto.randomUUID();
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
  });
  let stripeRefundId: string | null = null;
  if (order.stripePaymentIntentId && amountCents > 0) {
    const stripe = getStripe();
    if (stripe) {
      const refund = await stripe.refunds.create(
        {
          payment_intent: order.stripePaymentIntentId,
          amount: amountCents,
          refund_application_fee: feeReversed > 0,
          reverse_transfer: transferReversed > 0,
          metadata: { orderId: order.id, reason: input.reasonCode },
        },
        { idempotencyKey: key },
      );
      stripeRefundId = refund.id;
    }
  }
  const refundedCents = order.refundedCents + amountCents;
  const full = promoReversesOnRefund({ refundCents: amountCents, studentPaysCents: order.studentPaysCents, alreadyRefundedCents: order.refundedCents });
  await db.update(orders).set({
    refundedCents,
    status: full ? "refunded" : order.status,
    updatedAt: new Date(),
  }).where(eq(orders.id, order.id));
  if (full && order.promoCodeId) {
    await db.update(promoRedemptions).set({ reversed: true }).where(and(eq(promoRedemptions.orderId, order.id), eq(promoRedemptions.reversed, false)));
  }
  await db.update(refundLedger).set({ status: stripeRefundId || amountCents === 0 ? "posted" : order.stripePaymentIntentId ? "posted" : "offline", stripeRefundId }).where(eq(refundLedger.id, id));
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
