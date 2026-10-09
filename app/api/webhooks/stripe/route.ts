import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { fulfillPaidCheckout, refundOrderByPaymentIntent } from "@/lib/booking-service";
import { db } from "@/lib/db";
import { stripeEvents, teachers } from "@/lib/db/schema";
import { getStripe } from "@/lib/stripe";
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

async function dispatchStripeEvent(event: Stripe.Event) {
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const orderId = session.metadata?.orderId;
    const paymentIntent = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
    const subscription = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
    if (orderId) await fulfillPaidCheckout(orderId, paymentIntent ?? null, subscription ?? null);
  }
  if (event.type === "charge.refunded") {
    const charge = event.data.object;
    const intent = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
    if (intent && chargeRefundReleasesSeats(charge.refunded)) await refundOrderByPaymentIntent(intent);
  }
  if (event.type === "account.updated") {
    const account = event.data.object;
    const due = account.requirements?.currently_due?.join(", ") || null;
    await db.update(teachers).set({
      stripeDetailsSubmitted: account.details_submitted ?? false,
      stripeChargesEnabled: account.charges_enabled ?? false,
      stripePayoutsEnabled: account.payouts_enabled ?? false,
      stripeRequirementsDue: due,
      updatedAt: new Date(),
    }).where(eq(teachers.stripeAccountId, account.id));
  }
}
