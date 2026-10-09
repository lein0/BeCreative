import { SHIP_DEFAULTS, type NotificationEvent } from "@/lib/ship-defaults";
import { addDaysYmd, ymdInZone, zonedTimeToUtc } from "@/lib/time";

export type ChannelPrefs = { email: boolean; inApp: boolean; sms: boolean; push: boolean; cadence: "instant" | "daily" };

export function defaultPrefs(event: NotificationEvent, audience: "teacher" | "student"): ChannelPrefs {
  return {
    email: true,
    inApp: true,
    sms: false,
    push: false,
    cadence: audience === "teacher" ? SHIP_DEFAULTS.teacherCadence : "instant",
  };
}

export function channelsFor(prefs: ChannelPrefs, input: { unsubscribed: boolean; webPushEnabled: boolean; smsConfigured: boolean }) {
  return {
    email: prefs.email && !input.unsubscribed,
    inApp: prefs.inApp,
    sms: prefs.sms && input.smsConfigured,
    push: prefs.push && input.webPushEnabled,
    digest: prefs.cadence === "daily",
  };
}

export function minutesOfClock(clock: string) {
  const [hour, minute] = clock.split(":").map(Number);
  return hour * 60 + minute;
}

/** Quiet hours wrap past midnight. 21:00–08:00 includes 22:00 and 07:00, and excludes 12:00. */
export function withinQuietHours(localMinutes: number, start: string, end: string) {
  const open = minutesOfClock(start);
  const close = minutesOfClock(end);
  if (open === close) return false;
  if (open < close) return localMinutes >= open && localMinutes < close;
  return localMinutes >= open || localMinutes < close;
}

export function smsAllowedNow(localMinutes: number, start = SHIP_DEFAULTS.quietHoursStart, end = SHIP_DEFAULTS.quietHoursEnd) {
  return !withinQuietHours(localMinutes, start, end);
}

/** Next local quiet-hours end, using the zone's offset so winter time is not still quiet. */
export function nextQuietEnd(end: string, now = new Date(), timeZone = SHIP_DEFAULTS.quietHoursZone) {
  const [hour, minute] = end.split(":").map(Number);
  const clock = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  const today = ymdInZone(now, timeZone);
  const sameDay = zonedTimeToUtc(today, clock, timeZone);
  if (sameDay.getTime() > now.getTime()) return sameDay;
  return zonedTimeToUtc(addDaysYmd(today, 1), clock, timeZone);
}

export function unsubscribeUrl(origin: string, token: string) {
  return `${origin.replace(/\/$/, "")}/unsubscribe/${encodeURIComponent(token)}`;
}

/** Other channels can be marked sent while a quiet-hours text is still waiting. */
export function outboxStatusAfterDelivery(smsDeferred: boolean) {
  return smsDeferred ? "sms_pending" : "sent";
}

export function deferredSmsStillPending(status: string) {
  return status === "sms_pending";
}

/** Event saves must not write the credit preference. Only the credit form does. */
export function creditOptInFromForm(input: { saveCredit: boolean; checked: boolean }) {
  if (!input.saveCredit) return null;
  return input.checked;
}
