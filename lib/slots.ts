import { LA_TIMEZONE } from "@/lib/constants";
import { addDaysYmd, weekdayOfYmd, ymdInZone, zonedTimeToUtc } from "@/lib/time";

export type AvailabilityWindow = { weekday: number; start: string; end: string };
export type BusyRange = { startsAt: Date; endsAt: Date };
export type OpenSlot = { startsAt: Date; endsAt: Date; localDate: string; time: string; slackMinutes: number };

export function minutesOf(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

export function clockOf(minutes: number) {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function rangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

export function extraMinutesThatFit(startsAt: Date, endsAt: Date, windowEnd: Date, bufferMinutes: number, busy: BusyRange[]) {
  const pad = Math.max(0, bufferMinutes) * 60_000;
  let limit = windowEnd.getTime();
  for (const item of busy) {
    if (item.endsAt.getTime() + pad <= startsAt.getTime()) continue;
    const cap = item.startsAt.getTime() - pad;
    if (cap < limit) limit = cap;
  }
  return Math.max(0, Math.floor((limit - endsAt.getTime()) / 60_000));
}

export function appointmentConflicts(candidate: BusyRange, busy: BusyRange[], bufferMinutes: number) {
  const pad = bufferMinutes * 60_000;
  return busy.some((item) => rangesOverlap(
    candidate.startsAt,
    new Date(candidate.endsAt.getTime() + pad),
    item.startsAt,
    new Date(item.endsAt.getTime() + pad),
  ));
}

export function seatsLeft(capacity: number, taken: number) {
  return Math.max(0, capacity - taken);
}

export function canTakeSeat(capacity: number, taken: number) {
  return taken < capacity;
}

export function needsWaiver(input: { required: boolean; currentVersion: number | null; signedVersion: number | null }) {
  if (!input.required) return false;
  if (!input.currentVersion) return true;
  return input.signedVersion !== input.currentVersion;
}

export function withinCancellationWindow(startsAt: Date, now: Date, cancellationHours: number) {
  return now.getTime() + cancellationHours * 3_600_000 <= startsAt.getTime();
}

export function generateOpenSlots(input: {
  windows: AvailabilityWindow[];
  durationMinutes: number;
  bufferMinutes: number;
  from: Date;
  days: number;
  now: Date;
  leadTimeHours: number;
  busy?: BusyRange[];
  timeZone?: string;
}): OpenSlot[] {
  if (input.durationMinutes <= 0) return [];
  const zone = input.timeZone ?? LA_TIMEZONE;
  const step = input.durationMinutes + Math.max(0, input.bufferMinutes);
  const earliest = input.now.getTime() + input.leadTimeHours * 3_600_000;
  const startYmd = ymdInZone(input.from, zone);
  const slots: OpenSlot[] = [];
  for (let offset = 0; offset < input.days; offset += 1) {
    const localDate = addDaysYmd(startYmd, offset);
    const weekday = weekdayOfYmd(localDate);
    for (const window of input.windows.filter((item) => item.weekday === weekday)) {
      const open = minutesOf(window.start);
      const close = minutesOf(window.end);
      for (let cursor = open; cursor + input.durationMinutes <= close; cursor += step) {
        const time = clockOf(cursor);
        const startsAt = zonedTimeToUtc(localDate, time, zone);
        const endsAt = new Date(startsAt.getTime() + input.durationMinutes * 60_000);
        if (startsAt.getTime() < earliest) continue;
        const candidate = { startsAt, endsAt };
        const busy = input.busy ?? [];
        if (appointmentConflicts(candidate, busy, input.bufferMinutes)) continue;
        const windowEnd = zonedTimeToUtc(localDate, window.end, zone);
        slots.push({
          startsAt,
          endsAt,
          localDate,
          time,
          slackMinutes: extraMinutesThatFit(startsAt, endsAt, windowEnd, input.bufferMinutes, busy),
        });
      }
    }
  }
  return slots.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}
