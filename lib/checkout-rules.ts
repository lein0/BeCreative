import type { PriceQuote } from "@/lib/pricing";

/** Same-origin relative path. Rejects protocol-relative URLs and backslashes. */
export function safeNextPath(next: string | null | undefined, fallback = "/explore") {
  const value = (next ?? "").trim();
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\") || value.includes("://")) return fallback;
  return value;
}

export function errorRedirectPath(back: string | null | undefined, error: string, fallback = "/") {
  const path = safeNextPath(back, fallback);
  const joiner = path.includes("?") ? "&" : "?";
  return `${path}${joiner}error=${encodeURIComponent(error)}`;
}

export type AttributionCookie = {
  ref?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
};

export function parseAttributionCookie(raw: string | undefined | null) {
  const empty = { ref: null as string | null, utmSource: null as string | null, utmMedium: null as string | null, utmCampaign: null as string | null };
  if (!raw) return empty;
  try {
    const parsed = JSON.parse(raw) as AttributionCookie;
    return {
      ref: parsed.ref ?? null,
      utmSource: parsed.utm_source ?? parsed.utmSource ?? null,
      utmMedium: parsed.utm_medium ?? parsed.utmMedium ?? null,
      utmCampaign: parsed.utm_campaign ?? parsed.utmCampaign ?? null,
    };
  } catch {
    return empty;
  }
}

export function sessionLockOrder(ids: string[]) {
  return [...ids].sort();
}

export function duplicateSeriesBooking(existing: { classId: string; kind: string; status: string }[], classId: string) {
  return existing.some((booking) => booking.classId === classId && booking.kind === "series" && booking.status === "confirmed");
}

export function bookingResultPath(result: { error?: string; checkoutUrl?: string; waitlisted?: boolean; alreadyBooked?: boolean; slug?: string }) {
  if (result.error) return `/c/${result.slug ?? ""}?error=${encodeURIComponent(result.error)}`;
  if (result.alreadyBooked) return "/bookings?reserved=1";
  if (result.checkoutUrl) return result.checkoutUrl;
  if (result.waitlisted) return "/bookings?waitlisted=1";
  return "/bookings?reserved=1";
}

export function packCreditsOnCreate(input: { awaitingCardPayment: boolean; creditCount: number }) {
  return input.awaitingCardPayment ? 0 : input.creditCount;
}

export function packCreditsOnPayment(creditsTotal: number) {
  return creditsTotal;
}

export function membershipStatusOnCreate(awaitingCardPayment: boolean) {
  return awaitingCardPayment ? "pending" : "active";
}

export function membershipStatusOnPayment() {
  return "active" as const;
}

export function membershipStatusOnAbandon() {
  return "cancelled" as const;
}

export function orderMoney(
  quote: Pick<PriceQuote, "paymentPath" | "studentPaysCents" | "platformFeeCents" | "teacherAmountCents" | "platformLiabilityCents">,
  collectOnline: boolean,
) {
  if (collectOnline || quote.paymentPath !== "cash") {
    return {
      platformFeeCents: quote.platformFeeCents,
      teacherAmountCents: quote.teacherAmountCents,
      platformLiabilityCents: quote.platformLiabilityCents,
    };
  }
  return {
    platformFeeCents: 0,
    teacherAmountCents: quote.studentPaysCents,
    platformLiabilityCents: 0,
  };
}

export function collectsOnline(studentPaysCents: number, stripeReady: boolean) {
  return studentPaysCents > 0 && stripeReady;
}

export function studioOwnsResource(resourceTeacherId: string | null | undefined, studioTeacherId: string) {
  return Boolean(resourceTeacherId) && resourceTeacherId === studioTeacherId;
}

export function refundCancelsBooking(status: string) {
  return status === "confirmed";
}

export function sessionBelongsToClass(sessionClassId: string | null | undefined, classId: string) {
  return Boolean(classId) && sessionClassId === classId;
}

/** A second cancel of a date that is already cancelled must not grant credit or pack credits again. */
export function sessionCancelAlreadyApplied(status: string) {
  return status === "cancelled";
}

/** A pending card checkout that cannot charge has to drop the seat and the order. */
export function checkoutMustReleaseSeat(input: { paymentsReady: boolean; orderPending: boolean }) {
  return input.orderPending && !input.paymentsReady;
}

/** A Stripe `charge.refunded` event also fires for a partial refund. Only a fully refunded charge reverses the order. */
export function chargeFullyRefunded(charge: { amount?: number | null; amount_refunded?: number | null; refunded?: boolean | null }) {
  if (charge.refunded === true) return true;
  const amount = charge.amount ?? 0;
  const refunded = charge.amount_refunded ?? 0;
  return amount > 0 && refunded >= amount;
}

/** The first invoice is handled by checkout.session.completed. Later invoices extend access only when the period moves forward. */
export function membershipRenewalExtendsAccess(input: {
  billingReason: string | null | undefined;
  currentPeriodEnd: Date;
  invoicePeriodEnd: Date;
}) {
  if (!input.billingReason || input.billingReason === "subscription_create") return false;
  return input.invoicePeriodEnd.getTime() > input.currentPeriodEnd.getTime();
}

/** Keep the original order's fee split when a renewal charges the same amount. A different amount keeps that same ratio. */
export function renewalChargeSplit(
  original: { studentPaysCents: number; platformFeeCents: number; teacherAmountCents: number; listPriceCents: number; discountCents: number },
  amountPaidCents: number,
) {
  if (amountPaidCents === original.studentPaysCents) {
    return {
      listPriceCents: original.listPriceCents,
      discountCents: original.discountCents,
      studentPaysCents: amountPaidCents,
      platformFeeCents: original.platformFeeCents,
      teacherAmountCents: original.teacherAmountCents,
    };
  }
  const platformFeeCents = original.studentPaysCents > 0 ? Math.round((original.platformFeeCents * amountPaidCents) / original.studentPaysCents) : 0;
  return {
    listPriceCents: amountPaidCents,
    discountCents: 0,
    studentPaysCents: amountPaidCents,
    platformFeeCents,
    teacherAmountCents: Math.max(0, amountPaidCents - platformFeeCents),
  };
}

type StripeId = string | { id: string } | null | undefined;

function stripeId(value: StripeId) {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

/** Pull the subscription renewal fields we persist. Returns null when the invoice is not for a subscription. */
export function paidInvoiceRenewal(invoice: {
  id: string;
  billing_reason?: string | null;
  amount_paid: number;
  period_start: number;
  period_end: number;
  parent?: { subscription_details?: { subscription?: StripeId } | null } | null;
  payments?: { data?: Array<{ payment?: { payment_intent?: StripeId } | null }> } | null;
}) {
  const subscriptionId = stripeId(invoice.parent?.subscription_details?.subscription ?? null);
  if (!subscriptionId) return null;
  const payment = invoice.payments?.data?.map((row) => stripeId(row.payment?.payment_intent ?? null)).find((id): id is string => Boolean(id)) ?? null;
  return {
    subscriptionId,
    invoiceId: invoice.id,
    billingReason: invoice.billing_reason ?? null,
    amountPaidCents: invoice.amount_paid,
    paymentIntentId: payment,
    periodStart: new Date(invoice.period_start * 1000),
    periodEnd: new Date(invoice.period_end * 1000),
  };
}

/** Refund only sessions that have not started. Attended dates stay paid. */
export function unattendedRefundCents(input: { paidCents: number; sessions: { startsAt: Date }[]; now: Date }) {
  if (input.paidCents <= 0 || input.sessions.length === 0) return 0;
  const upcoming = input.sessions.filter((session) => session.startsAt > input.now).length;
  if (upcoming <= 0) return 0;
  if (upcoming >= input.sessions.length) return input.paidCents;
  return Math.floor((input.paidCents * upcoming) / input.sessions.length);
}
