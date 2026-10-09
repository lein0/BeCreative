export const ANALYTICS_EVENTS = [
  "page_view",
  "screen_view",
  "search",
  "filter_used",
  "class_viewed",
  "booking_started",
  "checkout_started",
  "checkout_completed",
  "booking_cancelled",
  "signup_started",
  "signup_completed",
  "teacher_onboarding_step",
  "class_published",
  "stripe_connected",
  "first_booking_received",
  "offer_purchased",
  "promo_applied",
  "waitlist_joined",
  "notification_opened",
  "notification_clicked",
  "help_article_viewed",
  "ticket_opened",
  "feedback_filed",
  "experiment_exposed",
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];

export const MONEY_EVENTS = new Set<AnalyticsEventName>(["checkout_completed", "offer_purchased", "booking_cancelled", "promo_applied"]);

export function isCatalogEvent(name: string): name is AnalyticsEventName {
  return (ANALYTICS_EVENTS as readonly string[]).includes(name);
}

export const PLATFORMS = ["web", "ios", "android"] as const;
export type PlatformName = (typeof PLATFORMS)[number];

export function platformName(value: string | null | undefined): PlatformName {
  if (value === "ios" || value === "android") return value;
  return "web";
}

export const STUDENT_FUNNEL = [
  { key: "visit", label: "Visit", events: ["page_view", "screen_view"] },
  { key: "class_viewed", label: "Class view", events: ["class_viewed"] },
  { key: "checkout_started", label: "Checkout start", events: ["checkout_started"] },
  { key: "paid", label: "Paid", events: ["checkout_completed"] },
  { key: "attended", label: "Attended", events: [] },
  { key: "rebooked_30d", label: "Rebooked in 30 days", events: [] },
] as const;

export const TEACHER_FUNNEL = [
  { key: "signup", label: "Signup" },
  { key: "profile_done", label: "Profile done" },
  { key: "class_published", label: "First class published" },
  { key: "stripe_connected", label: "Stripe connected" },
  { key: "first_booking", label: "First booking" },
  { key: "five_bookings", label: "5+ bookings" },
] as const;
