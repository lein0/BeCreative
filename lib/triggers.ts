export type TriggerConsent = "transactional" | "marketing";

export type Trigger = {
  id: string;
  event: string;
  template: string;
  channels: Array<"email" | "in_app" | "sms">;
  delayMinutes: number;
  consent: TriggerConsent;
  description: string;
};

export const TRIGGERS: Trigger[] = [
  { id: "auth.verify", event: "auth.verify", template: "auth.verify", channels: ["email"], delayMinutes: 0, consent: "transactional", description: "Confirm a new email address" },
  { id: "auth.reset", event: "auth.reset", template: "auth.reset", channels: ["email"], delayMinutes: 0, consent: "transactional", description: "Password reset" },
  { id: "auth.invite", event: "auth.invite", template: "auth.invite", channels: ["email"], delayMinutes: 0, consent: "transactional", description: "Invite a teacher or teammate" },
  { id: "student.welcome", event: "student.welcome", template: "student.welcome", channels: ["email", "in_app"], delayMinutes: 0, consent: "transactional", description: "Welcome after signup" },
  { id: "booking.confirmed", event: "booking.confirmed", template: "booking.confirmed", channels: ["email", "in_app"], delayMinutes: 0, consent: "transactional", description: "Seat confirmed" },
  { id: "booking.reminder", event: "booking.reminder", template: "booking.reminder", channels: ["email", "in_app", "sms"], delayMinutes: 0, consent: "transactional", description: "Reminder 24 hours and 2 hours before. Text only at 2 hours." },
  { id: "booking.cancelled", event: "booking.cancelled", template: "booking.cancelled", channels: ["email", "in_app", "sms"], delayMinutes: 0, consent: "transactional", description: "Cancellation. Text only when it is the same day." },
  { id: "teacher.booking.cancelled", event: "booking.cancelled", template: "teacher.cancelled", channels: ["email", "in_app"], delayMinutes: 0, consent: "transactional", description: "Teacher: a date was cancelled" },
  { id: "booking.refunded", event: "booking.refunded", template: "booking.refunded", channels: ["email", "in_app"], delayMinutes: 0, consent: "transactional", description: "Refund issued" },
  { id: "waitlist.spot_open", event: "waitlist.spot_open", template: "waitlist.spot_open", channels: ["email", "in_app", "sms"], delayMinutes: 0, consent: "transactional", description: "A waitlist spot opened" },
  { id: "class.changed", event: "class.changed", template: "class.changed", channels: ["email", "in_app"], delayMinutes: 0, consent: "transactional", description: "Class time or place changed" },
  { id: "receipt.sent", event: "receipt.sent", template: "receipt.sent", channels: ["email", "in_app"], delayMinutes: 0, consent: "transactional", description: "Receipt" },
  { id: "membership.renewal", event: "membership.renewal", template: "membership.renewal", channels: ["email", "in_app"], delayMinutes: 0, consent: "transactional", description: "Membership renewal coming up" },
  { id: "membership.payment_failed", event: "membership.payment_failed", template: "membership.payment_failed", channels: ["email", "in_app"], delayMinutes: 0, consent: "transactional", description: "Membership payment failed" },
  { id: "review.ask", event: "review.ask", template: "review.ask", channels: ["email", "in_app"], delayMinutes: 120, consent: "transactional", description: "How was class" },
  { id: "winback", event: "winback", template: "winback", channels: ["email"], delayMinutes: 0, consent: "marketing", description: "Note after 30 quiet days. Marketing opt-in only." },
  { id: "booking.created", event: "booking.created", template: "teacher.booking", channels: ["email", "in_app"], delayMinutes: 0, consent: "transactional", description: "Teacher: new booking" },
  { id: "signup.followed", event: "signup.followed", template: "teacher.follow", channels: ["email", "in_app"], delayMinutes: 0, consent: "transactional", description: "Teacher: new follow" },
  { id: "waitlist.joined", event: "waitlist.joined", template: "teacher.waitlist", channels: ["email", "in_app"], delayMinutes: 0, consent: "transactional", description: "Teacher: waitlist join" },
  { id: "waitlist.promoted", event: "waitlist.promoted", template: "teacher.promoted", channels: ["email", "in_app"], delayMinutes: 0, consent: "transactional", description: "Teacher: waitlist auto-promote" },
  { id: "offer.purchased", event: "offer.purchased", template: "teacher.offer", channels: ["email", "in_app"], delayMinutes: 0, consent: "transactional", description: "Teacher: pack or membership purchase" },
  { id: "payout.sent", event: "payout.sent", template: "teacher.payout", channels: ["email", "in_app"], delayMinutes: 0, consent: "transactional", description: "Teacher: payout sent" },
  { id: "dispute.opened", event: "dispute.opened", template: "teacher.dispute", channels: ["email", "in_app"], delayMinutes: 0, consent: "transactional", description: "Teacher: dispute opened" },
  { id: "ticket.created", event: "ticket.created", template: "teacher.ticket", channels: ["email", "in_app"], delayMinutes: 0, consent: "transactional", description: "Teacher: new support ticket" },
  { id: "review.created", event: "review.created", template: "teacher.review", channels: ["email", "in_app"], delayMinutes: 0, consent: "transactional", description: "Teacher: new review" },
  { id: "teacher.approved", event: "teacher.approved", template: "teacher.approved", channels: ["email", "in_app"], delayMinutes: 0, consent: "transactional", description: "Studio approved" },
  { id: "teacher.stripe_incomplete", event: "teacher.stripe_incomplete", template: "teacher.stripe_incomplete", channels: ["email", "in_app"], delayMinutes: 0, consent: "transactional", description: "Stripe setup still open" },
  { id: "teacher.first_booking", event: "teacher.first_booking", template: "teacher.first_booking", channels: ["email", "in_app"], delayMinutes: 0, consent: "transactional", description: "First booking celebration" },
  { id: "teacher.weekly_summary", event: "teacher.weekly_summary", template: "teacher.weekly_summary", channels: ["email"], delayMinutes: 0, consent: "transactional", description: "Weekly bookings, revenue, and top links" },
  { id: "ticket.updated", event: "ticket.updated", template: "ticket.updated", channels: ["email", "in_app"], delayMinutes: 0, consent: "transactional", description: "Support reply" },
];

export function triggerForEvent(event: string) {
  return TRIGGERS.find((trigger) => trigger.event === event) ?? null;
}

/** Teacher and student share a few event names. Pick the template for the audience. */
export function templateFor(event: string, audience: "teacher" | "student") {
  const matches = TRIGGERS.filter((trigger) => trigger.event === event);
  const preferred = matches.find((trigger) => (audience === "teacher" ? trigger.id.startsWith("teacher.") : !trigger.id.startsWith("teacher.")));
  return preferred ?? matches[0] ?? null;
}

export function triggerEnabled(id: string, overrides: Record<string, boolean>) {
  if (id in overrides) return overrides[id];
  return true;
}
