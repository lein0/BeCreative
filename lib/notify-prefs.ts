import { unsubscribeBlocksEmail } from "@/lib/messaging-rules";
import { SHIP_DEFAULTS, type NotificationEvent } from "@/lib/ship-defaults";

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

export function channelsFor(prefs: ChannelPrefs, input: {
  unsubscribed: boolean;
  webPushEnabled: boolean;
  smsConfigured: boolean;
  smsOptIn?: boolean;
  emailSuppressed?: boolean;
  consent?: "transactional" | "marketing";
  marketingOptIn?: boolean;
  event?: string;
}) {
  const marketingBlocked = input.consent === "marketing" && input.marketingOptIn !== true;
  const unsubscribedBlocks = input.unsubscribed && unsubscribeBlocksEmail(input.event);
  return {
    email: prefs.email && !unsubscribedBlocks && !input.emailSuppressed && !marketingBlocked,
    inApp: prefs.inApp,
    sms: prefs.sms && input.smsConfigured && input.smsOptIn !== false,
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

export function unsubscribeUrl(origin: string, token: string) {
  return `${origin.replace(/\/$/, "")}/unsubscribe?token=${encodeURIComponent(token)}`;
}

/** Saving an enabled email channel turns booking mail back on. */
export function prefSaveUserPatch(input: { emailEnabled: boolean; creditOptIn: boolean }) {
  return {
    creditOptIn: input.creditOptIn,
    ...(input.emailEnabled ? { emailUnsubscribed: false as const } : {}),
  };
}
