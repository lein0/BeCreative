import { addDaysYmd, daysBetween, formatClock, prettyDateShort, weekdayName, weekdayOfYmd, zonedTimeToUtc } from "@/lib/time";

export type DayTime = { weekday: number; time: string };

export type RecurrenceRule = {
  timezone: string;
  frequency: "weekly" | "biweekly" | "monthly";
  days: DayTime[];
  startDate: string;
  endType: "never" | "on" | "after";
  endDate?: string | null;
  endCount?: number | null;
};

export type Occurrence = {
  date: string;
  time: string;
  weekday: number;
  startsAt: Date;
  endsAt: Date;
};

function ordinal(n: number): string {
  const mod = n % 100;
  if (mod >= 11 && mod <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

function weekOfMonth(ymd: string): number {
  return Math.ceil(Number(ymd.slice(8, 10)) / 7);
}

function firstOnOrAfter(start: string, weekday: number): string {
  const delta = (weekday - weekdayOfYmd(start) + 7) % 7;
  return addDaysYmd(start, delta);
}

function matches(rule: RecurrenceRule, ymd: string, anchors: Map<number, { date: string; ordinal: number }>): boolean {
  const weekday = weekdayOfYmd(ymd);
  const day = rule.days.find((item) => item.weekday === weekday);
  if (!day) return false;
  if (ymd < rule.startDate) return false;
  if (rule.frequency === "weekly") return true;
  if (rule.frequency === "biweekly") {
    const anchor = anchors.get(weekday);
    if (!anchor) return false;
    return daysBetween(anchor.date, ymd) % 14 === 0;
  }
  const anchor = anchors.get(weekday);
  return Boolean(anchor && weekOfMonth(ymd) === anchor.ordinal);
}

function anchorsFor(rule: RecurrenceRule): Map<number, { date: string; ordinal: number }> {
  const map = new Map<number, { date: string; ordinal: number }>();
  for (const day of rule.days) {
    const date = firstOnOrAfter(rule.startDate, day.weekday);
    map.set(day.weekday, { date, ordinal: weekOfMonth(date) });
  }
  return map;
}

export function collectOccurrences(rule: RecurrenceRule, from: string, until: string, durationMinutes: number, limit = 400): Occurrence[] {
  if (!rule.days.length || until < from) return [];
  const anchors = anchorsFor(rule);
  const start = from < rule.startDate ? rule.startDate : from;
  const hardEnd = rule.endType === "on" && rule.endDate && rule.endDate < until ? rule.endDate : until;
  const results: Occurrence[] = [];
  for (let cursor = start; cursor <= hardEnd && results.length < limit; cursor = addDaysYmd(cursor, 1)) {
    if (!matches(rule, cursor, anchors)) continue;
    const day = rule.days.find((item) => item.weekday === weekdayOfYmd(cursor));
    if (!day) continue;
    const startsAt = zonedTimeToUtc(cursor, day.time, rule.timezone);
    const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);
    results.push({ date: cursor, time: day.time, weekday: day.weekday, startsAt, endsAt });
  }
  return results;
}

export function previewOccurrences(rule: RecurrenceRule, durationMinutes: number, horizonDays = 56): Occurrence[] {
  if (rule.endType === "after") {
    const count = Math.max(1, rule.endCount ?? 1);
    const far = addDaysYmd(rule.startDate, 366 * 3);
    return collectOccurrences(rule, rule.startDate, far, durationMinutes, count).slice(0, count);
  }
  const until = rule.endType === "on" && rule.endDate ? rule.endDate : addDaysYmd(rule.startDate, horizonDays);
  return collectOccurrences(rule, rule.startDate, until, durationMinutes);
}

export function describeRecurrence(rule: RecurrenceRule): string {
  if (!rule.days.length) return "Pick at least one day.";
  const sorted = [...rule.days].sort((a, b) => a.weekday - b.weekday);
  const sameTime = sorted.every((day) => day.time === sorted[0]?.time);
  const dayList = sorted.map((day) => weekdayName(day.weekday));
  const joinedDays = dayList.length === 1 ? dayList[0] : `${dayList.slice(0, -1).join(", ")} & ${dayList.at(-1)}`;
  let when = "";
  if (rule.frequency === "monthly") {
    const anchors = anchorsFor(rule);
    const bits = sorted.map((day) => {
      const anchor = anchors.get(day.weekday);
      const label = anchor ? `${ordinal(anchor.ordinal)} ${weekdayName(day.weekday)}` : weekdayName(day.weekday);
      return sameTime ? label : `${label} at ${formatClock(day.time)}`;
    });
    const monthlyDays = bits.length === 1 ? bits[0] : `${bits.slice(0, -1).join(", ")} and ${bits.at(-1)}`;
    when = sameTime ? `Monthly on the ${monthlyDays} at ${formatClock(sorted[0]!.time)}` : `Monthly on the ${monthlyDays}`;
  } else if (sameTime) {
    const prefix = rule.frequency === "biweekly" ? "Every 2 weeks on" : "Every";
    when = `${prefix} ${joinedDays} at ${formatClock(sorted[0]!.time)}`;
  } else {
    const bits = sorted.map((day) => `${weekdayName(day.weekday)} at ${formatClock(day.time)}`);
    const prefix = rule.frequency === "biweekly" ? "Every 2 weeks on" : "Every";
    when = `${prefix} ${bits.join(" and ")}`;
  }
  const start = `starting ${prettyDateShort(rule.startDate)}`;
  if (rule.endType === "after") return `${when}, ${start}, ${rule.endCount ?? 0} sessions`;
  if (rule.endType === "on" && rule.endDate) return `${when}, ${start}, until ${prettyDateShort(rule.endDate)}`;
  return `${when}, ${start}, ongoing`;
}

export type ExistingSession = {
  id: string;
  date: string;
  hasBookings: boolean;
  exception: "moved" | "skipped" | null;
};

export type SessionDiff = {
  createDates: string[];
  deleteIds: string[];
  cancelIds: string[];
  keepIds: string[];
};

export function diffSessions(existing: ExistingSession[], desiredDates: string[]): SessionDiff {
  const desired = new Set(desiredDates);
  const createDates: string[] = [];
  const deleteIds: string[] = [];
  const cancelIds: string[] = [];
  const keepIds: string[] = [];
  const seenDates = new Set<string>();
  for (const session of existing) {
    if (session.exception) {
      keepIds.push(session.id);
      seenDates.add(session.date);
      continue;
    }
    if (desired.has(session.date)) {
      keepIds.push(session.id);
      seenDates.add(session.date);
      continue;
    }
    if (session.hasBookings) cancelIds.push(session.id);
    else deleteIds.push(session.id);
  }
  for (const date of desiredDates) {
    if (!seenDates.has(date)) createDates.push(date);
  }
  return { createDates, deleteIds, cancelIds, keepIds };
}
