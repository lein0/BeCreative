import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { fulfillPaidCheckout, refundOrderByPaymentIntent, renewMembershipFromInvoice } from "@/lib/booking-service";
import { chargeFullyRefunded, paidInvoiceRenewal } from "@/lib/checkout-rules";
import { handleEarlyFraud, recordDispute } from "@/lib/disputes";
import { logEvent } from "@/lib/log";
import { db } from "@/lib/db";
import { membershipSubscriptions, orders, stripeEvents, teachers } from "@/lib/db/schema";
import { getStripe } from "@/lib/stripe";
import { shouldRetryRenewal } from "@/lib/renewal-copy";
import { invoiceSubscriptionId } from "@/lib/stripe-invoice";
import { chargeRefundReleasesSeats, webhookClaimShouldRelease } from "@/lib/webhook-idempotency";

export async function POST(request: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) return new Response("Stripe is not configured.", { status: 400 });
  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });
  const event = stripe.webhooks.constructEvent(await request.text(), signature, secret);
  const claimed = await db.insert(stripeEvents).values({ id: event.id, type: event.type }).onConflictDoNothing().returning();
  if (!claimed.length) return new Response("ok");
  try {
    await dispatchStripeEvent(event);
  } catch (error) {
    if (webhookClaimShouldRelease({ claimed: claimed.length > 0, failed: true })) {
      await db.delete(stripeEvents).where(eq(stripeEvents.id, event.id));
    }
    console.error("Stripe webhook failed", event.id, error instanceof Error ? error.message : error);
    return new Response("Webhook handler failed", { status: 500 });
  }
  return new Response("ok");
}

export async function dispatchStripeEvent(event: Stripe.Event) {
  if (event.type === "payment_intent.succeeded") {
    const intent = event.data.object;
    const orderId = intent.metadata?.orderId;
    if (orderId) await fulfillPaidCheckout(orderId, intent.id, null);
  }
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const orderId = session.metadata?.orderId;
    const paymentIntent = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
    const subscription = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
    if (orderId) await fulfillPaidCheckout(orderId, paymentIntent ?? null, subscription ?? null);
  }
  if (event.type === "invoice.paid") {
    const renewal = paidInvoiceRenewal(event.data.object);
    if (renewal) await renewMembershipFromInvoice(renewal);
  }
  if (event.type === "charge.refunded") {
    const charge = event.data.object;
    const intent = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
    const fullyRefunded = chargeFullyRefunded({ amount: charge.amount, amount_refunded: charge.amount_refunded, refunded: charge.refunded });
    if (intent && chargeRefundReleasesSeats(fullyRefunded)) await refundOrderByPaymentIntent(intent);
  }
  if (event.type === "charge.dispute.created" || event.type === "charge.dispute.updated" || event.type === "charge.dispute.closed" || event.type === "charge.dispute.funds_withdrawn" || event.type === "charge.dispute.funds_reinstated") {
    const dispute = event.data.object;
    const paymentIntent = typeof dispute.payment_intent === "string" ? dispute.payment_intent : dispute.payment_intent?.id;
    await recordDispute({
      id: dispute.id,
      paymentIntentId: paymentIntent,
      amountCents: dispute.amount,
      reason: dispute.reason,
      status: dispute.status,
      dueBy: dispute.evidence_details?.due_by ? new Date(dispute.evidence_details.due_by * 1000) : null,
    });
    logEvent("info", "dispute webhook", { type: event.type, disputeId: dispute.id });
  }
  if (event.type === "radar.early_fraud_warning.created") {
    const warning = event.data.object;
    const chargeId = typeof warning.charge === "string" ? warning.charge : warning.charge?.id;
    let paymentIntent = typeof warning.payment_intent === "string" ? warning.payment_intent : undefined;
    let amountCents = 0;
    if (chargeId) {
      const stripe = getStripe();
      if (!stripe) throw new Error("Stripe is not configured.");
      const charge = await stripe.charges.retrieve(chargeId);
      amountCents = charge.amount;
      paymentIntent = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id ?? paymentIntent;
    }
    await handleEarlyFraud({ chargeId: chargeId ?? warning.id, paymentIntentId: paymentIntent, amountCents });
  }
  if (event.type === "invoice.payment_failed") {
    const invoice = event.data.object;
    const subscription = invoiceSubscriptionId(invoice);
    if (subscription) {
      const [order] = await db.select().from(orders).where(eq(orders.stripeSubscriptionId, subscription)).limit(1);
      if (order) {
        const [sub] = await db.select().from(membershipSubscriptions).where(eq(membershipSubscriptions.orderId, order.id)).limit(1);
        if (sub && shouldRetryRenewal({ cancelAtPeriodEnd: sub.cancelAtPeriodEnd, status: sub.status })) {
          await db.update(membershipSubscriptions).set({ status: "past_due" }).where(eq(membershipSubscriptions.id, sub.id));
        }
      }
    }
  }
  if (event.type === "account.updated") {
    const account = event.data.object;
    const due = account.requirements?.currently_due?.join(", ") || null;
    const [before] = await db.select().from(teachers).where(eq(teachers.stripeAccountId, account.id)).limit(1);
    await db.update(teachers).set({
      stripeDetailsSubmitted: account.details_submitted ?? false,
      stripeChargesEnabled: account.charges_enabled ?? false,
      stripePayoutsEnabled: account.payouts_enabled ?? false,
      stripeRequirementsDue: due,
      updatedAt: new Date(),
    }).where(eq(teachers.stripeAccountId, account.id));
    if (account.charges_enabled && before && !before.stripeChargesEnabled) {
      const { capture } = await import("@/lib/analytics");
      await capture({ name: "stripe_connected", userId: before.userId, properties: { teacherId: before.id } });
    }
  }
}
