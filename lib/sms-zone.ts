export type SmsHrefTarget = { kind: "class" | "visit"; slug: string };

function hrefPath(href: string) {
  if (!href.startsWith("http")) return href;
  try {
    return new URL(href).pathname;
  } catch {
    return href;
  }
}

/** Class reminders use /c/. Visit reminders use /s/. */
export function smsHrefTarget(href: string | null | undefined): SmsHrefTarget | null {
  if (!href) return null;
  const path = hrefPath(href);
  const classSlug = path.match(/^\/c\/([^/?#]+)/)?.[1];
  if (classSlug) return { kind: "class", slug: decodeURIComponent(classSlug) };
  const visitSlug = path.match(/^\/s\/([^/?#]+)/)?.[1];
  if (visitSlug) return { kind: "visit", slug: decodeURIComponent(visitSlug) };
  return null;
}

export type ActivityZone = { startsAt: number; timeZone: string | null };

/** Soonest upcoming activity. If every one is past, the most recent. */
export function pickActivityTimeZone(candidates: ActivityZone[], now = Date.now()) {
  const dated = candidates.filter((row) => row.timeZone);
  if (!dated.length) return null;
  const upcoming = dated.filter((row) => row.startsAt >= now).sort((a, b) => a.startsAt - b.startsAt);
  const chosen = upcoming[0] ?? [...dated].sort((a, b) => b.startsAt - a.startsAt)[0];
  return chosen?.timeZone ?? null;
}

/** A visit uses the teacher's class zone, preferring the service's location. */
export function teacherActivityTimeZone(
  zones: { locationId: string | null; timeZone: string | null }[],
  locationId: string | null,
) {
  if (locationId) {
    const atPlace = zones.find((row) => row.locationId === locationId && row.timeZone);
    if (atPlace?.timeZone) return atPlace.timeZone;
  }
  return zones.find((row) => row.timeZone)?.timeZone ?? null;
}

export function deviceTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone?.trim() || null;
  } catch {
    return null;
  }
}

export async function syncDeviceTimeZone(update: (body: { timezone: string }) => Promise<unknown>, zone = deviceTimeZone()) {
  if (!zone) return false;
  await update({ timezone: zone });
  return true;
}
