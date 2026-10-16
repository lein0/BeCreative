export const ROLES = ["student", "teacher", "account_manager", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const SKILL_LEVELS = ["beginner", "intermediate", "advanced", "all_levels"] as const;
export type SkillLevel = (typeof SKILL_LEVELS)[number];

export const CLASS_FORMATS = ["drop_in", "series", "workshop", "private_lesson"] as const;
export type ClassFormat = (typeof CLASS_FORMATS)[number];

export const DELIVERY_MODES = ["in_person", "virtual"] as const;
export type DeliveryMode = (typeof DELIVERY_MODES)[number];

export const TEACHER_STATUSES = ["pending", "approved", "rejected"] as const;
export const CLASS_STATUSES = ["draft", "published", "archived"] as const;
export const SESSION_STATUSES = ["scheduled", "cancelled", "completed", "paused"] as const;

export const OUTREACH_STATUSES = [
  "not_contacted",
  "attempted",
  "contacted",
  "replied",
  "meeting_booked",
  "demo_done",
  "onboarding",
  "live",
  "not_interested",
  "do_not_contact",
] as const;
export type OutreachStatus = (typeof OUTREACH_STATUSES)[number];

export const OUTREACH_LABELS: Record<OutreachStatus, string> = {
  not_contacted: "Not contacted",
  attempted: "Attempted",
  contacted: "Contacted",
  replied: "Replied",
  meeting_booked: "Meeting booked",
  demo_done: "Demo done",
  onboarding: "Onboarding",
  live: "Live on platform",
  not_interested: "Not interested",
  do_not_contact: "Do not contact",
};

export const PRIORITIES = ["A", "B", "C"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const LEAD_CSV_COLUMNS = [
  "lead_id",
  "business_name",
  "category",
  "subcategory",
  "business_type",
  "city",
  "neighborhood",
  "street_address",
  "zip",
  "phone",
  "email",
  "website",
  "instagram",
  "tiktok",
  "facebook",
  "youtube",
  "linkedin",
  "other_social",
  "owner_or_contact_name",
  "contact_role",
  "google_maps_url",
  "yelp_url",
  "rating",
  "review_count",
  "price_hint",
  "offers_online",
  "class_formats",
  "est_size",
  "notes",
  "source_urls",
  "date_added",
  "priority",
  "outreach_status",
  "last_contacted",
  "next_step",
  "owner_bd_rep",
] as const;

export const LEVEL_LABELS: Record<SkillLevel, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
  all_levels: "All levels",
};

export const FORMAT_LABELS: Record<ClassFormat, string> = {
  drop_in: "Drop-in",
  series: "Multi-week series",
  workshop: "Workshop",
  private_lesson: "Private lesson",
};

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export const LA_TIMEZONE = "America/Los_Angeles";

export const NEIGHBORHOODS: { name: string; lat: number; lng: number }[] = [
  { name: "Hollywood", lat: 34.0928, lng: -118.3287 },
  { name: "Silver Lake", lat: 34.0869, lng: -118.2702 },
  { name: "Burbank", lat: 34.1808, lng: -118.309 },
  { name: "North Hollywood", lat: 34.187, lng: -118.3813 },
  { name: "Studio City", lat: 34.1484, lng: -118.3965 },
  { name: "Santa Monica", lat: 34.0195, lng: -118.4912 },
  { name: "Echo Park", lat: 34.0782, lng: -118.2606 },
  { name: "Los Feliz", lat: 34.1066, lng: -118.2879 },
  { name: "Venice", lat: 33.985, lng: -118.4695 },
  { name: "Pasadena", lat: 34.1478, lng: -118.1445 },
  { name: "Highland Park", lat: 34.1114, lng: -118.1926 },
];

export function labelForOutreach(value: string): string {
  return OUTREACH_LABELS[value as OutreachStatus] ?? value;
}

export function outreachFromLabel(value: string): OutreachStatus | null {
  const normalized = value.trim().toLowerCase();
  const byValue = OUTREACH_STATUSES.find((status) => status === normalized.replace(/\s+/g, "_"));
  if (byValue) return byValue;
  const match = (Object.entries(OUTREACH_LABELS) as [OutreachStatus, string][]).find(
    ([, label]) => label.toLowerCase() === normalized,
  );
  return match?.[0] ?? null;
}
