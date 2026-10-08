import { decideBooking, decideSeriesBooking, type SessionState } from "../../../lib/booking-rules";
import {
  canSpendMembership,
  canSpendPack,
  firstClassFreeEligible,
  normalizeCodes,
  offerCoversClass,
  quotePrice,
  type PriceQuote,
  type PromoRule,
} from "../../../lib/pricing";
import type { BookingKind, HelpAction, RefundKind } from "../api/types";

export type SessionChoice = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  status: SessionState;
  capacity: number;
  confirmedCount: number;
};

export type SlotChoice = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  remaining: number;
  priceCents: number;
};

export type AddonChoice = { id: string; priceCents: number };

export type EntitlementChoice =
  | { type: "pack"; creditsRemaining: number; expiresAt: Date | null; classIds: string[]; categoryIds: string[] }
  | {
      type: "membership";
      status: string;
      periodEnd: Date;
      unlimited: boolean;
      classesPerPeriod: number | null;
      classesUsed: number;
      classIds: string[];
      categoryIds: string[];
    };

const REASON_COPY: Record<string, string> = {
  full: "That time is full.",
  cancelled_session: "That date was cancelled.",
  paused: "That date is paused.",
  past: "That time has already started.",
  already_booked: "You already have this date.",
  completed: "That class is over.",
};

export function reasonCopy(reason: string): string {
  return REASON_COPY[reason] ?? reason;
}

export function selectionListPrice(input: {
  kind: BookingKind;
  now: Date;
  sessionPriceCents: number;
  seriesPriceCents: number | null;
  session?: SessionChoice | null;
  seriesSessions?: SessionChoice[];
  slot?: SlotChoice | null;
  addons?: AddonChoice[];
  partySize?: number;
  alreadyBooked?: boolean;
  waitlistEnabled?: boolean;
}): { ok: true; cents: number; label: string; sessionIds: string[]; status: "confirmed" | "waitlisted" } | { ok: false; reason: string } {
  const party = Math.max(1, input.partySize ?? 1);
  if (input.kind === "session") {
    if (!input.session) return { ok: false, reason: "Choose a date." };
    const decision = decideBooking({
      now: input.now,
      sessionStartsAt: input.session.startsAt,
      sessionStatus: input.session.status,
      capacity: input.session.capacity,
      confirmedCount: input.session.confirmedCount,
      waitlistEnabled: input.waitlistEnabled ?? false,
      alreadyBooked: input.alreadyBooked ?? false,
    });
    if (!decision.ok) return { ok: false, reason: reasonCopy(decision.reason) };
    if (decision.status === "waitlisted") return { ok: true, cents: 0, label: "Waitlist", sessionIds: [input.session.id], status: "waitlisted" };
    return { ok: true, cents: input.sessionPriceCents, label: "This date", sessionIds: [input.session.id], status: "confirmed" };
  }
  if (input.kind === "series") {
    if (input.seriesPriceCents == null) return { ok: false, reason: "This class is not sold as a series." };
    const decision = decideSeriesBooking(
      (input.seriesSessions ?? []).map((session) => ({
        id: session.id,
        startsAt: session.startsAt,
        status: session.status,
        capacity: session.capacity,
        confirmedCount: session.confirmedCount,
      })),
      input.now,
    );
    if (!decision.ok) return { ok: false, reason: decision.reason };
    return { ok: true, cents: input.seriesPriceCents, label: "Whole series", sessionIds: decision.sessionIds, status: "confirmed" };
  }
  if (!input.slot) return { ok: false, reason: "Choose a time." };
  if (input.slot.startsAt.getTime() <= input.now.getTime()) return { ok: false, reason: "That time has already started." };
  if (input.slot.remaining < party) return { ok: false, reason: "Not enough spots left in that time." };
  const addons = (input.addons ?? []).reduce((sum, addon) => sum + addon.priceCents, 0);
  const base = input.slot.priceCents + addons;
  const cents = input.kind === "capacity" ? base * party : base;
  return {
    ok: true,
    cents,
    label: input.kind === "appointment" ? "Appointment" : "Time slot",
    sessionIds: [],
    status: "confirmed",
  };
}

export function normalizePromoInput(codes: string[]): { code: string | null; error: string | null } {
  return normalizeCodes(codes);
}

export function priceBooking(input: {
  listPriceCents: number;
  feePercent: number;
  feeFixedCents: number;
  promo?: PromoRule | null;
  promoError?: string | null;
  kind: BookingKind;
  firstClassFreeEnabled: boolean;
  introAlreadyUsed: boolean;
  entitlement?: boolean;
}): PriceQuote {
  const intro =
    input.kind === "session" &&
    firstClassFreeEligible({
      enabled: input.firstClassFreeEnabled,
      alreadyRedeemed: input.introAlreadyUsed,
      listPriceCents: input.listPriceCents,
    });
  return quotePrice({
    listPriceCents: input.listPriceCents,
    feePercent: input.feePercent,
    feeFixedCents: input.feeFixedCents,
    promo: input.entitlement || intro ? null : input.promo,
    promoError: input.entitlement || intro ? null : input.promoError,
    entitlement: input.entitlement,
    firstClassFree: intro,
  });
}

export function entitlementCovers(input: {
  classId: string;
  categoryId: string;
  now: Date;
  pack?: EntitlementChoice & { type: "pack" };
  membership?: EntitlementChoice & { type: "membership" };
  kind: BookingKind;
}): { ok: true; which: "pack" | "membership" } | { ok: false; reason: string } {
  if (input.kind === "series") return { ok: false, reason: "Packs and memberships don't pay a series price." };
  if (input.pack) {
    const covers = offerCoversClass(input.pack, input.classId, input.categoryId);
    const decision = canSpendPack({ creditsRemaining: input.pack.creditsRemaining, expiresAt: input.pack.expiresAt, now: input.now, covers });
    if (!decision.ok) return decision;
    return { ok: true, which: "pack" };
  }
  if (input.membership) {
    const covers = offerCoversClass(input.membership, input.classId, input.categoryId);
    const decision = canSpendMembership({
      status: input.membership.status,
      periodEnd: input.membership.periodEnd,
      now: input.now,
      unlimited: input.membership.unlimited,
      classesPerPeriod: input.membership.classesPerPeriod,
      classesUsed: input.membership.classesUsed,
      covers,
    });
    if (!decision.ok) return decision;
    return { ok: true, which: "membership" };
  }
  return { ok: false, reason: "Choose a pack or membership." };
}

const FULL_REFUND_MS = 24 * 60 * 60 * 1000;
const CREDIT_REFUND_MS = 2 * 60 * 60 * 1000;
const RESCHEDULE_MS = 12 * 60 * 60 * 1000;

export function cancelDecision(input: {
  now: Date;
  startsAt: Date;
  status: "pending" | "confirmed" | "waitlisted" | "cancelled";
  kind: BookingKind;
}): { allowed: true; refund: RefundKind; message: string } | { allowed: false; reason: string } {
  if (input.status === "cancelled") return { allowed: false, reason: "This booking is already cancelled." };
  if (input.status === "waitlisted") {
    return { allowed: true, refund: "none", message: "You're off the waitlist. You were not charged." };
  }
  if (input.status === "pending") {
    return { allowed: true, refund: "none", message: "This unpaid hold is released." };
  }
  if (input.startsAt.getTime() <= input.now.getTime()) {
    return { allowed: false, reason: "This class has already started." };
  }
  const lead = input.startsAt.getTime() - input.now.getTime();
  const seriesNote = input.kind === "series" ? " Cancelling a series drops every remaining date and is not prorated." : "";
  if (lead >= FULL_REFUND_MS) {
    return { allowed: true, refund: "full", message: `Full refund. Cancel at least 24 hours ahead.${seriesNote}` };
  }
  if (lead >= CREDIT_REFUND_MS) {
    return { allowed: true, refund: "credit", message: `You'll get account credit. Card refunds close inside 24 hours.${seriesNote}` };
  }
  return { allowed: true, refund: "none", message: `Late cancel, no refund. The seat is released.${seriesNote}` };
}

export function canReschedule(input: {
  now: Date;
  startsAt: Date;
  status: "pending" | "confirmed" | "waitlisted" | "cancelled";
  kind: BookingKind;
}): { ok: true } | { ok: false; reason: string } {
  if (input.kind === "series") return { ok: false, reason: "Series bookings can't move one date. Cancel or ask for help." };
  if (input.status !== "confirmed") return { ok: false, reason: "Only a confirmed booking can move." };
  if (input.startsAt.getTime() - input.now.getTime() < RESCHEDULE_MS) {
    return { ok: false, reason: "Reschedule closes 12 hours before the start." };
  }
  return { ok: true };
}

export function rescheduleTargetSession(input: {
  now: Date;
  target: SessionChoice;
  waitlistEnabled?: boolean;
}): { ok: true } | { ok: false; reason: string } {
  const decision = decideBooking({
    now: input.now,
    sessionStartsAt: input.target.startsAt,
    sessionStatus: input.target.status,
    capacity: input.target.capacity,
    confirmedCount: input.target.confirmedCount,
    waitlistEnabled: false,
    alreadyBooked: false,
  });
  if (!decision.ok) return { ok: false, reason: reasonCopy(decision.reason) };
  if (decision.status !== "confirmed") return { ok: false, reason: "That date has no open seat." };
  if (input.waitlistEnabled && decision.status !== "confirmed") return { ok: false, reason: "That date has no open seat." };
  return { ok: true };
}

export function rescheduleTargetSlot(input: { now: Date; slot: SlotChoice; partySize?: number }): { ok: true } | { ok: false; reason: string } {
  const party = Math.max(1, input.partySize ?? 1);
  if (input.slot.startsAt.getTime() <= input.now.getTime()) return { ok: false, reason: "That time has already started." };
  if (input.slot.remaining < party) return { ok: false, reason: "Not enough spots left in that time." };
  return { ok: true };
}

export function waiverReady(input: { required: boolean; agreed: boolean; signedName: string; accountName: string }): { ok: true } | { ok: false; reason: string } {
  if (!input.required) return { ok: true };
  if (!input.agreed) return { ok: false, reason: "Agree to the waiver to book." };
  const signed = input.signedName.trim();
  if (signed.length < 2) return { ok: false, reason: "Type your name to sign the waiver." };
  if (signed.toLowerCase() !== input.accountName.trim().toLowerCase()) {
    return { ok: false, reason: "Sign with the name on your account." };
  }
  return { ok: true };
}

export function needsPaymentSheet(quote: Pick<PriceQuote, "paymentPath" | "studentPaysCents">): boolean {
  return quote.paymentPath === "cash" && quote.studentPaysCents > 0;
}

export type CalendarEvent = {
  title: string;
  startsAt: Date;
  endsAt: Date;
  location: string;
  details: string;
};

export function calendarEvent(input: { title: string; teacherName: string; startsAt: Date; endsAt: Date; location: string }): CalendarEvent {
  return {
    title: input.title,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    location: input.location,
    details: `${input.title} with ${input.teacherName} on BeCreative.`,
  };
}

export function googleCalendarLink(event: CalendarEvent): string {
  const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${stamp(event.startsAt)}/${stamp(event.endsAt)}`,
    details: event.details,
    location: event.location,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function helpActions(input: {
  now: Date;
  startsAt: Date;
  status: "pending" | "confirmed" | "waitlisted" | "cancelled";
  kind: BookingKind;
}): HelpAction[] {
  const cancel = cancelDecision(input);
  const move = canReschedule(input);
  return [
    {
      id: "cancel",
      label: "Cancel this booking",
      enabled: cancel.allowed,
      detail: cancel.allowed ? cancel.message : cancel.reason,
    },
    {
      id: "reschedule",
      label: "Reschedule",
      enabled: move.ok,
      detail: move.ok ? "Move to another open time. Closes 12 hours before start." : move.reason,
    },
    {
      id: "waiver_copy",
      label: "Email me the waiver",
      enabled: input.status !== "cancelled",
      detail: "We'll send the waiver you signed to your account email.",
    },
    {
      id: "ask_teacher",
      label: "Ask the teacher",
      enabled: true,
      detail: "Opens a support ticket tied to this booking.",
    },
    {
      id: "safety",
      label: "Report a safety issue",
      enabled: true,
      detail: "A person on the BeCreative team reads safety notes first.",
    },
  ];
}

export const CANCEL_WINDOWS = { fullRefundMs: FULL_REFUND_MS, creditRefundMs: CREDIT_REFUND_MS, rescheduleMs: RESCHEDULE_MS };
