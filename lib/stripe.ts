import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
})

export { stripe }

// Subscription plans configuration
export const SUBSCRIPTION_PLANS = {
  basic: {
    name: 'Basic',
    credits: 5,
    price: 1999, // $19.99
    stripePriceId: 'price_basic_credits', // Replace with actual Stripe price ID
  },
  premium: {
    name: 'Premium',
    credits: 10,
    price: 3499, // $34.99
    stripePriceId: 'price_premium_credits', // Replace with actual Stripe price ID
  },
  unlimited: {
    name: 'Unlimited',
    credits: 20,
    price: 5999, // $59.99
    stripePriceId: 'price_unlimited_credits', // Replace with actual Stripe price ID
  },
} as const

// Create a Stripe customer
export async function createStripeCustomer(email: string, name: string) {
  return await stripe.customers.create({
    email,
    name,
  })
}

// Create a subscription
export async function createSubscription(
  customerId: string,
  priceId: string,
  metadata?: Record<string, string>
) {
  return await stripe.subscriptions.create({
    customer: customerId,
    items: [{ price: priceId }],
    metadata,
    payment_behavior: 'default_incomplete',
    payment_settings: { save_default_payment_method: 'on_subscription' },
    expand: ['latest_invoice.payment_intent'],
  })
}

// Create a payment intent for one-time payments
export async function createPaymentIntent(
  amount: number,
  customerId: string,
  metadata?: Record<string, string>
) {
  return await stripe.paymentIntents.create({
    amount,
    currency: 'usd',
    customer: customerId,
    metadata,
    automatic_payment_methods: {
      enabled: true,
    },
  })
}

// Create a Stripe Connect account for instructors
export async function createConnectAccount(email: string, country: string = 'US') {
  return await stripe.accounts.create({
    type: 'express',
    country,
    email,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
  })
}

// Create a transfer to instructor's Connect account
export async function createTransfer(
  amount: number,
  destinationAccountId: string,
  description: string
) {
  return await stripe.transfers.create({
    amount,
    currency: 'usd',
    destination: destinationAccountId,
    description,
  })
}

// Get account link for instructor onboarding
export async function createAccountLink(accountId: string, refreshUrl: string, returnUrl: string) {
  return await stripe.accountLinks.create({
    account: accountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: 'account_onboarding',
  })
} 