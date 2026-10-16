export const secondPrivateMinutesDefault = "";
export const secondPrivatePriceDefault = "";

export function privateVisitOptions(input: { minutesA: string; priceA: string; minutesB: string; priceB: string }) {
  const first = lengthOption(input.minutesA, input.priceA, 60);
  const second = input.priceB.trim() === "" ? null : lengthOption(input.minutesB, input.priceB, 0);
  return [first, second].filter((option): option is { label: string; minutes: number; priceCents: number } => option != null);
}

function lengthOption(minutesRaw: string, priceRaw: string, minutesFallback: number) {
  const minutes = numberOr(minutesRaw, minutesFallback);
  const price = numberOr(priceRaw, 0);
  if (minutes <= 0 || price <= 0) return null;
  return { label: `${minutes} min`, minutes, priceCents: Math.round(price * 100) };
}

function numberOr(raw: string, fallback: number) {
  if (raw.trim() === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}
