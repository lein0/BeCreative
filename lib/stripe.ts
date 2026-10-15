import Stripe from "stripe";
import { statementDescriptorSuffix } from "@/lib/connect-rules";
import { appOrigin } from "@/lib/env";
import { savedCardDetails } from "@/lib/renewal-copy";
import { openInvoicesToVoid } from "@/lib/stripe-invoice";

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

async function voidOpenSubscriptionInvoices(stripe: Stripe, subscriptionId: string) {
  let startingAfter: string | undefined;
  for (;;) {
    const page = await stripe.invoices.list({
      subscription: subscriptionId,
      status: "open",
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    for (const id of openInvoicesToVoid(page.data)) await stripe.invoices.voidInvoice(id);
    if (!page.has_more || page.data.length === 0) return;
    const next = page.data[page.data.length - 1]?.id;
    if (!next || next === startingAfter) return;
    startingAfter = next;
  }
}

export async function stopSubscriptionRenewal(subscriptionId: string) {
  const stripe = getStripe();
  if (!stripe) return { ok: false as const, reason: "unconfigured" as const };
  await voidOpenSubscriptionInvoices(stripe, subscriptionId);
  await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true });
  return { ok: true as const };
}

function cardFromMethod(method: Stripe.PaymentMethod | string | null | undefined) {
  if (!method || typeof method === "string") return null;
  return savedCardDetails(method.card);
}

export async function subscriptionCard(input: { paymentIntentId?: string | null; subscriptionId?: string | null }) {
  const stripe = getStripe();
  if (!stripe) return null;
  try {
    if (input.subscriptionId) {
      const subscription = await stripe.subscriptions.retrieve(input.subscriptionId, { expand: ["default_payment_method"] });
      const onSubscription = cardFromMethod(subscription.default_payment_method);
      if (onSubscription) return onSubscription;
      if (typeof subscription.default_payment_method === "string") {
        const method = await stripe.paymentMethods.retrieve(subscription.default_payment_method);
        const card = savedCardDetails(method.card);
        if (card) return card;
      }
    }
    if (input.paymentIntentId) {
      const intent = await stripe.paymentIntents.retrieve(input.paymentIntentId, { expand: ["payment_method"] });
      const onIntent = cardFromMethod(intent.payment_method);
      if (onIntent) return onIntent;
      if (typeof intent.payment_method === "string") {
        const method = await stripe.paymentMethods.retrieve(intent.payment_method);
        return savedCardDetails(method.card);
      }
    }
  } catch {
    return null;
  }
  return null;
}

/** Card update only. Subscription cancel stays on Account › Memberships so the local cancel record is written. */
export function paymentPortalFeatures() {
  return {
    customer_update: { enabled: false },
    invoice_history: { enabled: false },
    payment_method_update: { enabled: true },
    subscription_cancel: { enabled: false },
    subscription_update: { enabled: false },
  };
}

export function paymentPortalSessionParams(customer: string, returnUrl: string, configuration?: string) {
  return {
    customer,
    return_url: returnUrl,
    ...(configuration ? { configuration } : {}),
    flow_data: {
      type: "payment_method_update" as const,
      after_completion: {
        type: "redirect" as const,
        redirect: { return_url: returnUrl },
      },
    },
  };
}

let cardUpdatePortalConfig: Promise<string | null> | null = null;

function cardUpdatePortalConfiguration(stripe: Stripe) {
  if (!cardUpdatePortalConfig) {
    cardUpdatePortalConfig = stripe.billingPortal.configurations.create({
      name: "BeCreative card update",
      features: paymentPortalFeatures(),
    }).then((config) => config.id).catch(() => {
      cardUpdatePortalConfig = null;
      return null;
    });
  }
  return cardUpdatePortalConfig;
}

export async function paymentMethodPortalUrl(stripeSubscriptionId: string, returnPath: string) {
  const stripe = getStripe();
  if (!stripe) return { error: "Card update is not available right now." };
  try {
    const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
    const customer = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
    if (!customer) return { error: "This membership has no card on file to update." };
    const returnUrl = `${appOrigin()}${returnPath}`;
    const configuration = await cardUpdatePortalConfiguration(stripe);
    const session = await stripe.billingPortal.sessions.create(paymentPortalSessionParams(customer, returnUrl, configuration ?? undefined));
    if (!session.url) return { error: "Card update is not available right now." };
    return { url: session.url };
  } catch {
    return { error: "Card update is not available right now." };
  }
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
