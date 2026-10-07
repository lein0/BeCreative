import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { orders, teachers } from "@/lib/db/schema";
import { getStripe } from "@/lib/stripe";

export async function POST(request: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) return new Response("Stripe is not configured.", { status: 400 });
  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });
  const event = stripe.webhooks.constructEvent(await request.text(), signature, secret);
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const orderId = session.metadata?.orderId;
    const paymentIntent = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
    const subscription = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
    if (orderId) {
      await db.update(orders).set({ status: "paid", stripePaymentIntentId: paymentIntent ?? null, stripeSubscriptionId: subscription ?? null, updatedAt: new Date() }).where(and(eq(orders.id, orderId), eq(orders.status, "pending")));
    }
  }
  if (event.type === "charge.refunded") {
    const intent = typeof event.data.object.payment_intent === "string" ? event.data.object.payment_intent : event.data.object.payment_intent?.id;
    if (intent) await db.update(orders).set({ status: "refunded", updatedAt: new Date() }).where(eq(orders.stripePaymentIntentId, intent));
  }
  if (event.type === "account.updated") {
    const account = event.data.object;
    await db.update(teachers).set({
      stripeDetailsSubmitted: account.details_submitted ?? false,
      stripeChargesEnabled: account.charges_enabled ?? false,
      updatedAt: new Date(),
    }).where(eq(teachers.stripeAccountId, account.id));
  }
  return new Response("ok");
}
