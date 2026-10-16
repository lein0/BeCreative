import { offerCoversClass } from "@/lib/pricing";

/** Stripe PaymentSheet return. Must not be a bookings deep link, or 3DS unmounts checkout. */
export const PAYMENT_SHEET_RETURN_URL = "becreative://stripe-return";

export function systemPathForIncomingUrl(path: string) {
  if (path.includes("stripe-return")) return null;
  return path;
}

export function authNeedsVerification(result: { token?: string | null; verificationRequired?: boolean }) {
  return Boolean(result.verificationRequired) || !result.token;
}

export function paymentSheetForPlatform(platform: string | undefined, requested: boolean | undefined) {
  if ((platform ?? "web") === "web") return false;
  return requested !== false;
}

export function authSessionRedirect(platform: string, apiBase: string, nativeUrl: string) {
  const api = apiBase.replace(/\/$/, "");
  return platform === "web" ? `${api}/mobile/return` : nativeUrl;
}

/** Web checkout must stay on the HTTPS return URL so the auth session can finish. Native opens the app. */
export function mobileReturnTarget(input: { flow: string; cancelled: boolean; web: boolean }) {
  if (input.web) return null;
  const flag = input.cancelled ? "cancelled=1" : "paid=1";
  return `becreative://bookings?flow=${encodeURIComponent(input.flow)}&${flag}`;
}

/** Promo, pack, and membership edits keep the open checkout. Only a different seat releases it. */
export function keepCheckoutOpen(change: "seat" | "details", open: boolean) {
  return change === "seat" ? false : open;
}

export function fieldAutoCapitalize(keyboard: "default" | "email-address" | "phone-pad" = "default", secure = false) {
  if (secure || keyboard === "email-address" || keyboard === "phone-pad") return "none" as const;
  return "sentences" as const;
}

export function bookDisplayCents(input: { series: boolean; sessionPriceCents: number | null; seriesPriceCents?: number | null }) {
  if (input.series) return input.seriesPriceCents ?? null;
  return input.sessionPriceCents;
}

export function packsForClass<T extends { remaining: number; expiresAt?: string | null; classIds?: string[]; categoryIds?: string[]; teacherId?: string }>(
  packs: T[],
  classId: string,
  categoryId: string,
  teacherId?: string,
  now = new Date(),
) {
  return packs.filter((pack) => {
    if (pack.remaining <= 0) return false;
    if (pack.expiresAt && new Date(pack.expiresAt).getTime() < now.getTime()) return false;
    if (teacherId && pack.teacherId && pack.teacherId !== teacherId) return false;
    return offerCoversClass({ classIds: pack.classIds ?? [], categoryIds: pack.categoryIds ?? [] }, classId, categoryId);
  });
}

export function unpaidCheckoutOrder(result: { orderId?: string | null; checkoutUrl?: string | null; clientSecret?: string | null }) {
  if (!result.orderId) return null;
  if (!result.checkoutUrl && !result.clientSecret) return null;
  return result.orderId;
}

/** A changed date rebooks only after the previous unpaid checkout is released. */
export function orderToAbandon(input: { reopenCheckout: boolean; orderId?: string | null }) {
  if (input.reopenCheckout || !input.orderId) return null;
  return input.orderId;
}

export function membershipsForClass<T extends { status: string; periodEnd?: string | null; classIds?: string[]; categoryIds?: string[]; teacherId?: string }>(
  memberships: T[],
  classId: string,
  categoryId: string,
  teacherId?: string,
  now = new Date(),
) {
  return memberships.filter((plan) => {
    if (plan.status !== "active") return false;
    if (plan.periodEnd && new Date(plan.periodEnd).getTime() < now.getTime()) return false;
    if (teacherId && plan.teacherId && plan.teacherId !== teacherId) return false;
    return offerCoversClass({ classIds: plan.classIds ?? [], categoryIds: plan.categoryIds ?? [] }, classId, categoryId);
  });
}

/** Prefer a covering membership, then a pack. Otherwise the student pays cash. */
export function bookingPayWith(input: { membershipId?: string | null; packId?: string | null }) {
  if (input.membershipId) return `membership:${input.membershipId}`;
  if (input.packId) return `pack:${input.packId}`;
  return "cash";
}

export function checkoutCancelMessage(cancelled: string | string[] | undefined | null) {
  const value = Array.isArray(cancelled) ? cancelled[0] : cancelled;
  if (value !== "1") return null;
  return "Checkout was cancelled. This seat is not confirmed until payment finishes.";
}

export function acceptLatest(requestId: number, latestId: number) {
  return requestId === latestId;
}

export function postLoginPath(next: string | string[] | undefined | null) {
  const value = (Array.isArray(next) ? next[0] : next)?.trim() ?? "";
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\") || value.includes("://")) return "/explore";
  return value;
}

export function resumeBookingPath(input: { slug: string; sessionId?: string | null; series?: boolean; code?: string }) {
  const params = new URLSearchParams();
  if (!input.series && input.sessionId) params.set("session", input.sessionId);
  if (input.series) params.set("series", "1");
  const code = input.code?.trim();
  if (code) params.set("code", code);
  const qs = params.toString();
  return `/book/${encodeURIComponent(input.slug)}${qs ? `?${qs}` : ""}`;
}

export function bookingSubmitLock() {
  let held = false;
  return {
    tryAcquire() {
      if (held) return false;
      held = true;
      return true;
    },
    release() {
      held = false;
    },
  };
}

/** Back from checkout must be able to open the existing Stripe session again. */
export function bookingContinuePlan(reopenCheckout: boolean, lock: { tryAcquire(): boolean; release(): void }) {
  if (reopenCheckout) return { action: "reopen" as const };
  if (!lock.tryAcquire()) return { action: "wait" as const };
  return {
    action: "book" as const,
    finish(openedCheckout: boolean) {
      lock.release();
      return { busy: false, reopenCheckout: openedCheckout };
    },
  };
}

export function nativeIntentPath(path: string, initial: boolean, resolve: (value: string) => string | null = systemPathForIncomingUrl) {
  try {
    return resolve(path);
  } catch {
    return initial ? "/explore" : path;
  }
}

export function checkoutFollowsBooking(result: { alreadyBooked?: boolean }) {
  return result.alreadyBooked ? "bookings" : "checkout";
}
