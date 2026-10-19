import { SETTLED_CHECKOUT_ERROR } from "@/lib/checkout-rules";
import { offerCoversClass } from "@/lib/pricing";

export { SETTLED_CHECKOUT_ERROR };

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

const settledCheckoutIds = new Set<string>();

export function markCheckoutSettled(orderId: string | null | undefined) {
  if (orderId) settledCheckoutIds.add(orderId);
}

export function checkoutIsSettled(orderId: string | null | undefined) {
  return Boolean(orderId && settledCheckoutIds.has(orderId));
}

/** A paid checkout must not be sent through as a date change that books again. */
export function settledCheckoutBlocksRebook(input: { reopenCheckout: boolean; orderId?: string | null; settled?: boolean }) {
  return Boolean(input.orderId && !input.reopenCheckout && input.settled);
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

export function resumePurchasePath(input: { teacherSlug: string; packSlug?: string | null; membershipSlug?: string | null }) {
  const teacher = encodeURIComponent(input.teacherSlug);
  if (input.packSlug) return `/t/${teacher}/p/${encodeURIComponent(input.packSlug)}`;
  if (input.membershipSlug) return `/t/${teacher}/m/${encodeURIComponent(input.membershipSlug)}`;
  return `/t/${teacher}`;
}

const WAIVER_GATE_ERRORS = new Set([
  "The waiver didn't load. Try again before checkout.",
  "The waiver is still loading.",
  "Type your name to sign.",
]);

/** Signature field and checkout share one loaded waiver. A missing fetch cannot sign a prefilled name. */
export function waiverSignGate(input: {
  classRequiresSignature: boolean;
  waiver: { required: boolean; signed: boolean } | null;
  loadFailed: boolean;
  signedName: string;
}) {
  if (!input.classRequiresSignature) return { showNameField: false, readyToSign: false, blockReason: null as string | null };
  if (input.loadFailed) {
    return { showNameField: false, readyToSign: false, blockReason: "The waiver didn't load. Try again before checkout." };
  }
  if (!input.waiver) return { showNameField: false, readyToSign: false, blockReason: "The waiver is still loading." };
  const mustSign = input.waiver.required && !input.waiver.signed;
  if (!mustSign) return { showNameField: false, readyToSign: false, blockReason: null };
  if (!input.signedName.trim()) return { showNameField: true, readyToSign: false, blockReason: "Type your name to sign." };
  return { showNameField: true, readyToSign: true, blockReason: null };
}

/** A failed waiver fetch is only a checkout error when this class asks for a signature. */
export function waiverLoadNotice(classRequiresSignature: boolean, loadFailed: boolean) {
  if (!classRequiresSignature || !loadFailed) return null;
  return "The waiver didn't load. Try again before checkout.";
}

export function withoutStaleWaiverError(current: string | null) {
  if (current && WAIVER_GATE_ERRORS.has(current)) return null;
  return current;
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
