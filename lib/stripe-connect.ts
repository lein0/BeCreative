import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { teachers } from "@/lib/db/schema";
import { appOrigin } from "@/lib/env";
import { getStripe, stripeConfigured } from "@/lib/stripe";

export async function startConnectOnboarding(input: { teacherId: string; email: string; studioName: string }) {
  if (!stripeConfigured()) return { error: "Stripe is not configured yet. Bookings stay pay-at-studio." };
  const stripe = getStripe();
  if (!stripe) return { error: "Stripe is not configured yet." };
  const [teacher] = await db.select().from(teachers).where(eq(teachers.id, input.teacherId)).limit(1);
  if (!teacher) return { error: "Studio not found." };
  let accountId = teacher.stripeAccountId;
  if (!accountId) {
    const account = await stripe.accounts.create({
      type: "express",
      country: "US",
      email: input.email,
      capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      business_profile: { name: input.studioName },
    });
    accountId = account.id;
    await db.update(teachers).set({ stripeAccountId: accountId, updatedAt: new Date() }).where(eq(teachers.id, teacher.id));
  }
  const origin = appOrigin();
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${origin}/teach/billing?connect=refresh`,
    return_url: `${origin}/teach/billing?connect=return`,
    type: "account_onboarding",
  });
  return { url: link.url };
}

export async function syncConnectAccount(accountId: string) {
  const stripe = getStripe();
  if (!stripe) return null;
  const account = await stripe.accounts.retrieve(accountId);
  const due = account.requirements?.currently_due?.join(", ") || null;
  await db.update(teachers).set({
    stripeDetailsSubmitted: account.details_submitted ?? false,
    stripeChargesEnabled: account.charges_enabled ?? false,
    stripePayoutsEnabled: account.payouts_enabled ?? false,
    stripeRequirementsDue: due,
    updatedAt: new Date(),
  }).where(eq(teachers.stripeAccountId, accountId));
  return account;
}
