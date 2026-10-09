/** Configurable ship policies. Admin can override every value. These are the defaults. */
export const SHIP_DEFAULTS = {
  studentFullRefundHours: 24,
  studentCreditOnlyHours: 2,
  lateCancelFeeCents: 0,
  noShowFeeCents: 0,
  teacherCancelMode: "full_refund" as const,
  creditRequiresStudentOptIn: true,
  waitlistClaimHours: 4,
  reminderHours: [24, 2] as const,
  teacherCadence: "instant" as const,
  quietHoursStart: "21:00",
  quietHoursEnd: "08:00",
  quietHoursZone: "America/Los_Angeles",
  disputeAutoSubmit: true,
  disputeSubmitLeadHours: 48,
  disputeFeeBearer: "platform" as const,
  disputedAmountBearer: "teacher" as const,
  earlyFraudRefundMaxCents: 10000,
  statementDescriptorPrefix: "BECREATIVE",
  ticketTeacherSlaHours: 24,
  webPushEnabled: false,
  mailingAddress: "BeCreative, Los Angeles, CA",
  policyVersion: 1,
  smsMonthlyCapCents: 5000,
  smsSegmentCostCents: 1,
  imessageEnabled: false,
  winbackInactiveDays: 30,
  reviewAskHoursAfter: 2,
};

export type ShipDefaults = typeof SHIP_DEFAULTS;

export const TEACHER_EVENTS = [
  "booking.created",
  "signup.followed",
  "booking.cancelled",
  "waitlist.joined",
  "waitlist.promoted",
  "offer.purchased",
  "payout.sent",
  "dispute.opened",
  "ticket.created",
  "review.created",
  "teacher.approved",
  "teacher.stripe_incomplete",
  "teacher.first_booking",
  "teacher.weekly_summary",
] as const;

export const STUDENT_EVENTS = [
  "student.welcome",
  "booking.confirmed",
  "booking.reminder",
  "booking.cancelled",
  "booking.refunded",
  "waitlist.spot_open",
  "class.changed",
  "receipt.sent",
  "ticket.updated",
  "membership.renewal",
  "membership.payment_failed",
  "review.ask",
  "winback",
] as const;

export const NOTIFICATION_EVENTS = [...new Set([...TEACHER_EVENTS, ...STUDENT_EVENTS])] as const;
export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

export function policySummary(input: {
  fullRefundHours: number;
  creditOnlyHours: number;
  lateCancelFeeCents: number;
  noShowFeeCents: number;
}) {
  const late = input.lateCancelFeeCents > 0 ? ` A late cancel fee of $${(input.lateCancelFeeCents / 100).toFixed(2)} applies after that.` : "";
  const noShow = input.noShowFeeCents > 0 ? ` A no-show fee of $${(input.noShowFeeCents / 100).toFixed(2)} applies if you miss the class.` : "";
  return `Full refund until ${input.fullRefundHours} hours before the start. Studio credit only until ${input.creditOnlyHours} hours before. After that, the booking is not refunded.${late}${noShow}`;
}
