import { LA_TIMEZONE } from "@/lib/constants";
import { minutesOfClock, nextQuietEnd } from "@/lib/notify-prefs";

/** Inclusive start, exclusive end. 8:00 a.m. may send. 8:00 p.m. waits until the next morning. */
export const SMS_SEND_START = "08:00";
export const SMS_SEND_END = "20:00";

export function smsWindowOpen(localMinutes: number) {
  return localMinutes >= minutesOfClock(SMS_SEND_START) && localMinutes < minutesOfClock(SMS_SEND_END);
}

export function localMinutes(now: Date, timeZone: string) {
  const clock = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);
  return minutesOfClock(clock);
}

export function usableTimeZone(zone: string | null | undefined) {
  const value = zone?.trim();
  if (!value) return null;
  try {
    Intl.DateTimeFormat("en-US", { timeZone: value });
    return value;
  } catch {
    return null;
  }
}

/** Recipient zone when we have stored one. Otherwise the class zone. */
export function resolveSmsTimeZone(input: { recipientTimeZone?: string | null; classTimeZone?: string | null }) {
  return usableTimeZone(input.recipientTimeZone) || usableTimeZone(input.classTimeZone) || LA_TIMEZONE;
}

export function smsSendDecision(now: Date, input: { recipientTimeZone?: string | null; classTimeZone?: string | null }) {
  const timeZone = resolveSmsTimeZone(input);
  const open = smsWindowOpen(localMinutes(now, timeZone));
  return {
    timeZone,
    send: open,
    runAt: open ? now : nextQuietEnd(SMS_SEND_START, now, timeZone),
  };
}
