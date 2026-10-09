import { offerCoversClass } from "@/lib/pricing";

/** Stripe PaymentSheet return. Must not be a bookings deep link, or 3DS unmounts checkout. */
export const PAYMENT_SHEET_RETURN_URL = "becreative://stripe-return";

export function paymentSheetForPlatform(platform: string | undefined, requested: boolean | undefined) {
  if ((platform ?? "web") === "web") return false;
  return requested !== false;
}

export function authSessionRedirect(platform: string, apiBase: string, nativeUrl: string) {
  const api = apiBase.replace(/\/$/, "");
  return platform === "web" ? `${api}/mobile/return` : nativeUrl;
}

export function fieldAutoCapitalize(keyboard: "default" | "email-address" | "phone-pad" = "default", secure = false) {
  if (secure || keyboard === "email-address" || keyboard === "phone-pad") return "none" as const;
  return "sentences" as const;
}

export function bookDisplayCents(input: { series: boolean; sessionPriceCents: number | null; seriesPriceCents?: number | null }) {
  if (input.series) return input.seriesPriceCents ?? null;
  return input.sessionPriceCents;
}

export function packsForClass<T extends { remaining: number; classIds?: string[]; categoryIds?: string[]; teacherId?: string }>(
  packs: T[],
  classId: string,
  categoryId: string,
  teacherId?: string,
) {
  return packs.filter((pack) => {
    if (pack.remaining <= 0) return false;
    if (teacherId && pack.teacherId && pack.teacherId !== teacherId) return false;
    return offerCoversClass({ classIds: pack.classIds ?? [], categoryIds: pack.categoryIds ?? [] }, classId, categoryId);
  });
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

export function checkoutFollowsBooking(result: { alreadyBooked?: boolean }) {
  return result.alreadyBooked ? "bookings" : "checkout";
}
