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
