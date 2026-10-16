import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function money(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function slugify(value: string): string {
  const base = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
  return base || "item";
}

export function uniqueSlug(value: string): string {
  return `${slugify(value)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function one(value: string | string[] | undefined | null): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export function priceLabel(sessionCents: number | null | undefined, seriesCents: number | null | undefined): string {
  const prices = [sessionCents, seriesCents].filter((value): value is number => value != null);
  if (!prices.length) return "Free";
  const low = Math.min(...prices);
  if (low === 0) return "Free";
  return prices.length > 1 ? `from ${money(low)}` : money(low);
}
