import { eq } from "drizzle-orm";
import { fulfillPaidCheckout, refundOrderByPaymentIntent } from "@/lib/booking-service";
import { handleEarlyFraud, recordDispute } from "@/lib/disputes";
import { logEvent } from "@/lib/log";
import { db } from "@/lib/db";
import { stripeEvents, teachers } from "@/lib/db/schema";
import { getStripe } from "@/lib/stripe";

export async function POST(request: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) return new Response("Stripe is not configured.", { status: 400 });
  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });
  const event = stripe.webhooks.constructEvent(await request.text(), signature, secret);
  const claimed = await db.insert(stripeEvents).values({ id: event.id, type: event.type }).onConflictDoNothing().returning();
  if (!claimed.length) return new Response("ok");
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const orderId = session.metadata?.orderId;
    const paymentIntent = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
    const subscription = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
    if (orderId) await fulfillPaidCheckout(orderId, paymentIntent ?? null, subscription ?? null);
  }
  if (event.type === "charge.refunded") {
    const intent = typeof event.data.object.payment_intent === "string" ? event.data.object.payment_intent : event.data.object.payment_intent?.id;
    if (intent) await refundOrderByPaymentIntent(intent);
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
      const charge = await stripe.charges.retrieve(chargeId);
      amountCents = charge.amount;
      paymentIntent = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id ?? paymentIntent;
    }
    await handleEarlyFraud({ chargeId: chargeId ?? warning.id, paymentIntentId: paymentIntent, amountCents });
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
  return new Response("ok");
}
