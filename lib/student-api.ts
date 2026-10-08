import { LA_TIMEZONE } from "@/lib/constants";

export const APP_PASSWORD_RESET_PATH = "/reset";
export const APP_EMAIL_VERIFY_PATH = "/verify";

export type Place = {
  lat: number;
  lng: number;
  neighborhood: string;
  name: string | null;
  city: string | null;
};

export function placeFields(location: { lat: number; lng: number; neighborhood: string; name?: string | null; city?: string | null } | null | undefined): Place | null {
  if (!location) return null;
  return {
    lat: location.lat,
    lng: location.lng,
    neighborhood: location.neighborhood,
    name: location.name ?? null,
    city: location.city ?? null,
  };
}

export function classNeedsSignature(waiverBody: string | null | undefined) {
  return Boolean(waiverBody?.trim());
}

export type OfferPack = { id: string; slug: string; name: string; priceCents: number; creditCount: number };
export type OfferMembership = { id: string; slug: string; name: string; priceCents: number };

export function teacherOffers(packs: OfferPack[], memberships: OfferMembership[]) {
  return {
    packs: packs.map((pack) => ({ id: pack.id, slug: pack.slug, name: pack.name, priceCents: pack.priceCents, creditCount: pack.creditCount })),
    memberships: memberships.map((plan) => ({ id: plan.id, slug: plan.slug, name: plan.name, priceCents: plan.priceCents })),
  };
}

export function pickBookingSession<T extends { startsAt: Date; endsAt: Date }>(rows: T[], now = new Date()) {
  if (!rows.length) return null;
  const upcoming = rows.filter((row) => row.startsAt.getTime() >= now.getTime()).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  if (upcoming[0]) return upcoming[0];
  return [...rows].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0] ?? null;
}

export function bookingTimezone(timezones: string[]) {
  return timezones.find((zone) => zone.trim()) || LA_TIMEZONE;
}

export type ReauthBody = { password?: string; provider?: string; idToken?: string; nonce?: string };

export function reauthMethod(body: ReauthBody) {
  if (body.password) return "password" as const;
  if (body.idToken && (body.provider === "apple" || body.provider === "google")) return "social" as const;
  return null;
}

export function socialLinkAllowed(input: { providerEmailVerified: boolean; localEmailVerified: boolean; sameEmail: boolean }) {
  return input.sameEmail && input.providerEmailVerified && input.localEmailVerified;
}
