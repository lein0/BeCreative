import { FORMAT_LABELS, LEVEL_LABELS, type ClassFormat, type SkillLevel } from "../../lib/constants";

export function money(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export function priceLabel(sessionCents: number | null | undefined, seriesCents: number | null | undefined): string {
  const prices = [sessionCents, seriesCents].filter((value): value is number => value != null);
  if (!prices.length) return "Free";
  const low = Math.min(...prices);
  if (low === 0) return "Free";
  return prices.length > 1 ? `from ${money(low)}` : money(low);
}

export function levelLabel(value: string): string {
  return LEVEL_LABELS[value as SkillLevel] ?? value;
}

export function formatLabel(value: string): string {
  return FORMAT_LABELS[value as ClassFormat] ?? value;
}

export function whenLabel(iso: string | null, timeZone = "America/Los_Angeles"): string {
  if (!iso) return "Dates soon";
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function placeLabel(location: { name?: string | null; neighborhood?: string | null; city?: string | null } | null | undefined): string {
  if (!location) return "Online";
  const parts = [location.name, location.neighborhood, location.city].filter((part): part is string => Boolean(part));
  return parts.length ? parts.join(" · ") : "In person";
}

export function mapPins<T extends { lat?: number | null; lng?: number | null; delivery?: string | null }>(classes: T[]): T[] {
  return classes.filter((item) => item.delivery !== "virtual" && typeof item.lat === "number" && typeof item.lng === "number");
}
