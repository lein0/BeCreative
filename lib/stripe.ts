import Stripe from "stripe";
import { appOrigin } from "@/lib/env";

export function stripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
}

export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key);
}

export async function createCheckout(input: {
  name: string;
  amountCents: number;
  applicationFeeCents: number;
  destinationAccountId?: string | null;
  customerEmail?: string | null;
  successPath: string;
  cancelPath: string;
  metadata: Record<string, string>;
  recurring?: { interval: "month"; intervalCount: number } | null;
}) {
  const stripe = getStripe();
  const appUrl = appOrigin();
  if (!stripe || input.amountCents <= 0) return null;
  const fee = Math.max(0, Math.min(input.applicationFeeCents, input.amountCents - 1));
  const transfer = input.destinationAccountId
    ? { transfer_data: { destination: input.destinationAccountId }, ...(input.recurring ? {} : { application_fee_amount: fee }) }
    : {};
  const session = await stripe.checkout.sessions.create({
    mode: input.recurring ? "subscription" : "payment",
    customer_email: input.customerEmail ?? undefined,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: input.amountCents,
          product_data: { name: input.name },
          ...(input.recurring ? { recurring: { interval: "month", interval_count: input.recurring.intervalCount } } : {}),
        },
      },
    ],
    success_url: `${appUrl}${input.successPath}`,
    cancel_url: `${appUrl}${input.cancelPath}`,
    metadata: input.metadata,
    ...(input.recurring
      ? {
          subscription_data: {
            metadata: input.metadata,
            ...(input.destinationAccountId ? { transfer_data: { destination: input.destinationAccountId }, application_fee_percent: feePercent(input) } : {}),
          },
        }
      : { payment_intent_data: { metadata: input.metadata, ...transfer } }),
  });
  return session;
}

function feePercent(input: { amountCents: number; applicationFeeCents: number }) {
  if (input.amountCents <= 0) return 0;
  return Math.min(100, Math.round((input.applicationFeeCents / input.amountCents) * 1000) / 10);
}
