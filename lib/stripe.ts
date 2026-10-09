import Stripe from "stripe";
import { statementDescriptorSuffix } from "@/lib/connect-rules";
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
  statementDescriptor?: string;
  recurring?: { interval: "month"; intervalCount: number; trialPeriodDays?: number } | null;
  oneTimeAmountCents?: number;
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
      ...(input.oneTimeAmountCents && input.oneTimeAmountCents > 0
        ? [{ quantity: 1, price_data: { currency: "usd" as const, unit_amount: input.oneTimeAmountCents, product_data: { name: `${input.name} intro` } } }]
        : []),
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
            ...(input.recurring.trialPeriodDays ? { trial_period_days: input.recurring.trialPeriodDays } : {}),
            ...(input.destinationAccountId ? { transfer_data: { destination: input.destinationAccountId }, application_fee_percent: feePercent(input) } : {}),
          },
        }
      : {
          payment_intent_data: {
            metadata: input.metadata,
            ...(input.statementDescriptor ? { statement_descriptor_suffix: statementDescriptorSuffix(input.statementDescriptor) } : {}),
            ...transfer,
          },
        }),
  });
  return session;
}

export async function createPaymentIntent(input: {
  amountCents: number;
  applicationFeeCents: number;
  destinationAccountId?: string | null;
  customerEmail?: string | null;
  metadata: Record<string, string>;
  statementDescriptor?: string;
}) {
  const stripe = getStripe();
  if (!stripe || input.amountCents <= 0) return null;
  const fee = Math.max(0, Math.min(input.applicationFeeCents, input.amountCents - 1));
  return stripe.paymentIntents.create({
    amount: input.amountCents,
    currency: "usd",
    receipt_email: input.customerEmail ?? undefined,
    metadata: input.metadata,
    automatic_payment_methods: { enabled: true },
    ...(input.statementDescriptor ? { statement_descriptor_suffix: input.statementDescriptor.replace(/[^a-zA-Z0-9]/g, "").slice(-10) || "STUDIO" } : {}),
    ...(input.destinationAccountId ? { transfer_data: { destination: input.destinationAccountId }, application_fee_amount: fee } : {}),
  });
}

function feePercent(input: { amountCents: number; applicationFeeCents: number }) {
  if (input.amountCents <= 0) return 0;
  return Math.min(100, Math.round((input.applicationFeeCents / input.amountCents) * 1000) / 10);
}

export async function stopSubscriptionRenewal(subscriptionId: string) {
  const stripe = getStripe();
  if (!stripe) return { ok: false as const, reason: "unconfigured" as const };
  await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true });
  return { ok: true as const };
}

export async function setSubscriptionRenewalAmount(subscriptionId: string, amountCents: number) {
  const stripe = getStripe();
  if (!stripe || amountCents <= 0) return { ok: false as const, reason: "unconfigured" as const };
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const item = subscription.items.data[0];
  if (!item?.price.recurring) return { ok: false as const, reason: "missing-item" as const };
  const product = typeof item.price.product === "string" ? item.price.product : item.price.product.id;
  await stripe.subscriptions.update(subscriptionId, {
    proration_behavior: "none",
    items: [{
      id: item.id,
      price_data: {
        currency: item.price.currency,
        unit_amount: amountCents,
        product,
        recurring: { interval: item.price.recurring.interval, interval_count: item.price.recurring.interval_count ?? 1 },
      },
    }],
  });
  return { ok: true as const };
}
