import { generateOpenSlots, type AvailabilityWindow } from "@/lib/slots";

export type VisitListing = {
  title: string;
  studioName: string;
  categoryName: string;
  categorySlug: string;
  priceCents: number;
  lat: number | null;
  lng: number | null;
  windows: AvailabilityWindow[];
  durationMinutes: number;
  leadTimeHours: number;
};

export type ExploreVisitFilters = {
  q?: string;
  category?: string;
  maxPrice?: number;
  date?: string;
  lat?: number;
  lng?: number;
  miles?: number;
  now?: Date;
  timeZone?: string;
};

export function milesBetween(lat1: number, lng1: number, lat2: number, lng2: number) {
  const r = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
}

export function visitListPriceCents(kind: string, priceCents: number, optionPrices: number[]) {
  if (kind === "appointment" && optionPrices.length) return Math.min(...optionPrices);
  return priceCents;
}

export function visitDurationMinutes(kind: string, slotMinutes: number | null, optionMinutes: number[]) {
  if (kind === "access") return slotMinutes && slotMinutes > 0 ? slotMinutes : 60;
  if (optionMinutes.length) return Math.min(...optionMinutes);
  return slotMinutes && slotMinutes > 0 ? slotMinutes : 60;
}

export function visitMatchesExploreFilters(visit: VisitListing, filters: ExploreVisitFilters) {
  const query = (filters.q ?? "").trim().toLowerCase();
  if (query && !`${visit.title} ${visit.studioName} ${visit.categoryName}`.toLowerCase().includes(query)) return false;
  if (filters.category && visit.categorySlug !== filters.category) return false;
  if (filters.maxPrice && visit.priceCents > filters.maxPrice * 100) return false;
  if (filters.lat != null && filters.lng != null && filters.miles) {
    if (visit.lat == null || visit.lng == null) return false;
    if (milesBetween(filters.lat, filters.lng, visit.lat, visit.lng) > filters.miles) return false;
  }
  if (filters.date) {
    const now = filters.now ?? new Date();
    const next = generateOpenSlots({
      windows: visit.windows,
      durationMinutes: visit.durationMinutes > 0 ? visit.durationMinutes : 60,
      bufferMinutes: 0,
      from: now,
      days: 56,
      now,
      leadTimeHours: visit.leadTimeHours,
      busy: [],
      timeZone: filters.timeZone,
    })[0]?.localDate;
    if (!next || next < filters.date) return false;
  }
  return true;
}
