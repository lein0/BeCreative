import { sql } from "drizzle-orm";
import { boolean, doublePrecision, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import type { DayTime } from "@/lib/recurrence";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  isDemo: boolean("is_demo").notNull().default(false),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const userRoles = pgTable(
  "user_roles",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
  },
  (table) => [uniqueIndex("user_roles_unique").on(table.userId, table.role)],
);

export const teachers = pgTable("teachers", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }).unique(),
  slug: text("slug").notNull().unique(),
  studioName: text("studio_name"),
  bio: text("bio").notNull().default(""),
  photoUrl: text("photo_url"),
  specialties: text("specialties").array().notNull().default(sql`ARRAY[]::text[]`),
  instagram: text("instagram"),
  website: text("website"),
  tiktok: text("tiktok"),
  youtube: text("youtube"),
  status: text("status").notNull().default("pending"),
  rejectionReason: text("rejection_reason"),
  stripeAccountId: text("stripe_account_id"),
  stripeDetailsSubmitted: boolean("stripe_details_submitted").notNull().default(false),
  stripeChargesEnabled: boolean("stripe_charges_enabled").notNull().default(false),
  firstClassFree: boolean("first_class_free").notNull().default(false),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const categories = pgTable("categories", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  parentId: text("parent_id"),
  vertical: text("vertical").notNull().default("creative"),
});

export const locations = pgTable("locations", {
  id: text("id").primaryKey(),
  name: text("name"),
  addressLine1: text("address_line1").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  postalCode: text("postal_code").notNull(),
  neighborhood: text("neighborhood").notNull(),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  isDemo: boolean("is_demo").notNull().default(false),
});

export const classes = pgTable("classes", {
  id: text("id").primaryKey(),
  teacherId: text("teacher_id").notNull().references(() => teachers.id, { onDelete: "cascade" }),
  categoryId: text("category_id").notNull().references(() => categories.id),
  subcategoryId: text("subcategory_id").references(() => categories.id),
  locationId: text("location_id").references(() => locations.id),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  outcomes: text("outcomes").notNull().default(""),
  prerequisites: text("prerequisites").notNull().default(""),
  whatToBring: text("what_to_bring").notNull().default(""),
  skillLevel: text("skill_level").notNull(),
  format: text("format").notNull(),
  delivery: text("delivery").notNull(),
  virtualLink: text("virtual_link"),
  maxSize: integer("max_size").notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  pricePerSessionCents: integer("price_per_session_cents"),
  pricePerSeriesCents: integer("price_per_series_cents"),
  seriesBookingEnabled: boolean("series_booking_enabled").notNull().default(false),
  firstClassFree: boolean("first_class_free").notNull().default(false),
  status: text("status").notNull().default("draft"),
  featured: boolean("featured").notNull().default(false),
  waitlistEnabled: boolean("waitlist_enabled").notNull().default(false),
  coverImageUrl: text("cover_image_url"),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const recurrences = pgTable("recurrences", {
  id: text("id").primaryKey(),
  classId: text("class_id").notNull().references(() => classes.id, { onDelete: "cascade" }),
  timezone: text("timezone").notNull().default("America/Los_Angeles"),
  frequency: text("frequency").notNull(),
  days: jsonb("days").$type<DayTime[]>().notNull(),
  startDate: text("start_date").notNull(),
  endType: text("end_type").notNull(),
  endDate: text("end_date"),
  endCount: integer("end_count"),
  paused: boolean("paused").notNull().default(false),
  durationMinutes: integer("duration_minutes").notNull(),
  capacity: integer("capacity").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    classId: text("class_id").notNull().references(() => classes.id, { onDelete: "cascade" }),
    recurrenceId: text("recurrence_id").references(() => recurrences.id, { onDelete: "set null" }),
    startsAt: ts("starts_at").notNull(),
    endsAt: ts("ends_at").notNull(),
    localDate: text("local_date").notNull(),
    capacity: integer("capacity").notNull(),
    status: text("status").notNull().default("scheduled"),
    exception: text("exception"),
    cancellationReason: text("cancellation_reason"),
    isDemo: boolean("is_demo").notNull().default(false),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (table) => [index("sessions_class_starts").on(table.classId, table.startsAt)],
);

export const classMedia = pgTable("class_media", {
  id: text("id").primaryKey(),
  classId: text("class_id").notNull().references(() => classes.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  type: text("type").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isDemo: boolean("is_demo").notNull().default(false),
});

export const packs = pgTable("packs", {
  id: text("id").primaryKey(),
  teacherId: text("teacher_id").notNull().references(() => teachers.id, { onDelete: "cascade" }),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  creditCount: integer("credit_count").notNull(),
  priceCents: integer("price_cents").notNull(),
  expiryDays: integer("expiry_days").notNull().default(90),
  classIds: text("class_ids").array().notNull().default(sql`ARRAY[]::text[]`),
  categoryIds: text("category_ids").array().notNull().default(sql`ARRAY[]::text[]`),
  active: boolean("active").notNull().default(true),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const memberships = pgTable("memberships", {
  id: text("id").primaryKey(),
  teacherId: text("teacher_id").notNull().references(() => teachers.id, { onDelete: "cascade" }),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  termMonths: integer("term_months").notNull(),
  kind: text("kind").notNull(),
  classesPerPeriod: integer("classes_per_period"),
  priceCents: integer("price_cents").notNull(),
  recurring: boolean("recurring").notNull().default(true),
  pauseCancelPolicy: text("pause_cancel_policy").notNull().default(""),
  classIds: text("class_ids").array().notNull().default(sql`ARRAY[]::text[]`),
  categoryIds: text("category_ids").array().notNull().default(sql`ARRAY[]::text[]`),
  active: boolean("active").notNull().default(true),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const promoCodes = pgTable("promo_codes", {
  id: text("id").primaryKey(),
  teacherId: text("teacher_id").references(() => teachers.id, { onDelete: "cascade" }),
  code: text("code").notNull().unique(),
  discountType: text("discount_type").notNull(),
  percentOffBps: integer("percent_off_bps").notNull().default(0),
  amountOffCents: integer("amount_off_cents").notNull().default(0),
  appliesTo: text("applies_to").notNull().default("all"),
  classIds: text("class_ids").array().notNull().default(sql`ARRAY[]::text[]`),
  categoryIds: text("category_ids").array().notNull().default(sql`ARRAY[]::text[]`),
  packIds: text("pack_ids").array().notNull().default(sql`ARRAY[]::text[]`),
  membershipIds: text("membership_ids").array().notNull().default(sql`ARRAY[]::text[]`),
  cities: text("cities").array().notNull().default(sql`ARRAY[]::text[]`),
  startsAt: ts("starts_at"),
  endsAt: ts("ends_at"),
  maxRedemptions: integer("max_redemptions"),
  maxPerCustomer: integer("max_per_customer"),
  firstTimeOnly: boolean("first_time_only").notNull().default(false),
  minPurchaseCents: integer("min_purchase_cents").notNull().default(0),
  funding: text("funding").notNull().default("teacher"),
  platformSharePercent: integer("platform_share_percent").notNull().default(0),
  active: boolean("active").notNull().default(true),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const orders = pgTable("orders", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
  teacherId: text("teacher_id").references(() => teachers.id, { onDelete: "set null" }),
  kind: text("kind").notNull(),
  status: text("status").notNull(),
  listPriceCents: integer("list_price_cents").notNull().default(0),
  discountCents: integer("discount_cents").notNull().default(0),
  studentPaysCents: integer("student_pays_cents").notNull().default(0),
  platformFeeCents: integer("platform_fee_cents").notNull().default(0),
  teacherAmountCents: integer("teacher_amount_cents").notNull().default(0),
  platformFundedCents: integer("platform_funded_cents").notNull().default(0),
  teacherFundedCents: integer("teacher_funded_cents").notNull().default(0),
  platformLiabilityCents: integer("platform_liability_cents").notNull().default(0),
  promoCodeId: text("promo_code_id").references(() => promoCodes.id),
  paymentPath: text("payment_path").notNull().default("cash"),
  stripeCheckoutSessionId: text("stripe_checkout_session_id"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  ref: text("ref"),
  utmSource: text("utm_source"),
  utmMedium: text("utm_medium"),
  utmCampaign: text("utm_campaign"),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const bookings = pgTable("bookings", {
  id: text("id").primaryKey(),
  orderId: text("order_id").references(() => orders.id, { onDelete: "set null" }),
  userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
  classId: text("class_id").notNull().references(() => classes.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  status: text("status").notNull().default("confirmed"),
  guestName: text("guest_name"),
  guestEmail: text("guest_email"),
  source: text("source").notNull().default("online"),
  notes: text("notes"),
  packPurchaseId: text("pack_purchase_id"),
  membershipSubscriptionId: text("membership_subscription_id"),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: ts("created_at").notNull().defaultNow(),
  cancelledAt: ts("cancelled_at"),
});

export const bookingSessions = pgTable(
  "booking_sessions",
  {
    id: text("id").primaryKey(),
    bookingId: text("booking_id").notNull().references(() => bookings.id, { onDelete: "cascade" }),
    sessionId: text("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
    checkedIn: boolean("checked_in").notNull().default(false),
    checkedInAt: ts("checked_in_at"),
  },
  (table) => [uniqueIndex("booking_session_unique").on(table.bookingId, table.sessionId)],
);

export const packPurchases = pgTable("pack_purchases", {
  id: text("id").primaryKey(),
  orderId: text("order_id").references(() => orders.id, { onDelete: "set null" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  packId: text("pack_id").notNull().references(() => packs.id, { onDelete: "cascade" }),
  teacherId: text("teacher_id").notNull().references(() => teachers.id, { onDelete: "cascade" }),
  creditsTotal: integer("credits_total").notNull(),
  creditsRemaining: integer("credits_remaining").notNull(),
  expiresAt: ts("expires_at"),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const membershipSubscriptions = pgTable("membership_subscriptions", {
  id: text("id").primaryKey(),
  orderId: text("order_id").references(() => orders.id, { onDelete: "set null" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  membershipId: text("membership_id").notNull().references(() => memberships.id, { onDelete: "cascade" }),
  teacherId: text("teacher_id").notNull().references(() => teachers.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("active"),
  currentPeriodStart: ts("current_period_start").notNull(),
  currentPeriodEnd: ts("current_period_end").notNull(),
  classesUsedThisPeriod: integer("classes_used_this_period").notNull().default(0),
  classesPerPeriod: integer("classes_per_period"),
  unlimited: boolean("unlimited").notNull().default(false),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const creditLedger = pgTable("credit_ledger", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
  teacherId: text("teacher_id").references(() => teachers.id, { onDelete: "set null" }),
  bookingId: text("booking_id").references(() => bookings.id, { onDelete: "set null" }),
  sourceType: text("source_type").notNull(),
  sourceId: text("source_id").notNull(),
  direction: text("direction").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const promoRedemptions = pgTable("promo_redemptions", {
  id: text("id").primaryKey(),
  promoCodeId: text("promo_code_id").notNull().references(() => promoCodes.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
  orderId: text("order_id").references(() => orders.id, { onDelete: "set null" }),
  discountCents: integer("discount_cents").notNull(),
  platformFundedCents: integer("platform_funded_cents").notNull().default(0),
  teacherFundedCents: integer("teacher_funded_cents").notNull().default(0),
  reversed: boolean("reversed").notNull().default(false),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const introRedemptions = pgTable("intro_redemptions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  teacherId: text("teacher_id").notNull().references(() => teachers.id, { onDelete: "cascade" }),
  bookingId: text("booking_id").references(() => bookings.id, { onDelete: "set null" }),
  restored: boolean("restored").notNull().default(false),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const waitlistEntries = pgTable("waitlist_entries", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("waiting"),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const reviews = pgTable("reviews", {
  id: text("id").primaryKey(),
  classId: text("class_id").references(() => classes.id, { onDelete: "cascade" }),
  teacherId: text("teacher_id").notNull().references(() => teachers.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  rating: integer("rating").notNull(),
  body: text("body").notNull().default(""),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const platformSettings = pgTable("platform_settings", {
  id: integer("id").primaryKey().default(1),
  feePercent: integer("fee_percent").notNull().default(10),
  feeFixedCents: integer("fee_fixed_cents").notNull().default(0),
  updatedAt: ts("updated_at").notNull().defaultNow(),
  updatedBy: text("updated_by"),
});

export const payouts = pgTable("payouts", {
  id: text("id").primaryKey(),
  teacherId: text("teacher_id").notNull().references(() => teachers.id, { onDelete: "cascade" }),
  amountCents: integer("amount_cents").notNull(),
  status: text("status").notNull().default("paid"),
  notes: text("notes"),
  stripeTransferId: text("stripe_transfer_id"),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const emailOutbox = pgTable("email_outbox", {
  id: text("id").primaryKey(),
  toAddresses: text("to_addresses").array().notNull(),
  subject: text("subject").notNull(),
  textBody: text("text_body").notNull(),
  htmlBody: text("html_body"),
  provider: text("provider").notNull(),
  status: text("status").notNull(),
  error: text("error"),
  teacherId: text("teacher_id"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const auditLog = pgTable("audit_log", {
  id: text("id").primaryKey(),
  actorUserId: text("actor_user_id"),
  onBehalfOfTeacherId: text("on_behalf_of_teacher_id"),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  summary: text("summary").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const linkClicks = pgTable("link_clicks", {
  id: text("id").primaryKey(),
  teacherId: text("teacher_id").references(() => teachers.id, { onDelete: "cascade" }),
  targetType: text("target_type").notNull(),
  targetId: text("target_id"),
  path: text("path").notNull(),
  code: text("code"),
  ref: text("ref"),
  utmSource: text("utm_source"),
  utmMedium: text("utm_medium"),
  utmCampaign: text("utm_campaign"),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const leads = pgTable("leads", {
  id: text("id").primaryKey(),
  businessName: text("business_name").notNull(),
  category: text("category").notNull().default(""),
  subcategory: text("subcategory").notNull().default(""),
  businessType: text("business_type").notNull().default(""),
  city: text("city").notNull().default(""),
  neighborhood: text("neighborhood").notNull().default(""),
  streetAddress: text("street_address").notNull().default(""),
  zip: text("zip").notNull().default(""),
  phone: text("phone").notNull().default(""),
  email: text("email").notNull().default(""),
  website: text("website").notNull().default(""),
  websiteDomain: text("website_domain"),
  instagram: text("instagram").notNull().default(""),
  tiktok: text("tiktok").notNull().default(""),
  facebook: text("facebook").notNull().default(""),
  youtube: text("youtube").notNull().default(""),
  linkedin: text("linkedin").notNull().default(""),
  otherSocial: text("other_social").notNull().default(""),
  contactName: text("contact_name").notNull().default(""),
  contactRole: text("contact_role").notNull().default(""),
  googleMapsUrl: text("google_maps_url").notNull().default(""),
  yelpUrl: text("yelp_url").notNull().default(""),
  rating: text("rating").notNull().default(""),
  reviewCount: integer("review_count"),
  priceHint: text("price_hint").notNull().default(""),
  offersOnline: boolean("offers_online").notNull().default(false),
  classFormats: text("class_formats").notNull().default(""),
  estSize: text("est_size").notNull().default(""),
  notes: text("notes").notNull().default(""),
  sourceUrls: text("source_urls").notNull().default(""),
  dateAdded: text("date_added").notNull(),
  priority: text("priority").notNull().default("B"),
  outreachStatus: text("outreach_status").notNull().default("not_contacted"),
  lastContacted: text("last_contacted"),
  nextStep: text("next_step").notNull().default(""),
  nextStepDue: text("next_step_due"),
  assignedUserId: text("assigned_user_id").references(() => user.id, { onDelete: "set null" }),
  convertedTeacherId: text("converted_teacher_id").references(() => teachers.id, { onDelete: "set null" }),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const leadActivities = pgTable("lead_activities", {
  id: text("id").primaryKey(),
  leadId: text("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  body: text("body").notNull().default(""),
  authorUserId: text("author_user_id").references(() => user.id, { onDelete: "set null" }),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const leadViews = pgTable("lead_views", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  filters: jsonb("filters").$type<Record<string, string>>().notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export type FeedbackViewport = { w: number; h: number; dpr: number; scroll_x: number; scroll_y: number };

export type FeedbackMark =
  | { type: "box"; x: number; y: number; w: number; h: number }
  | { type: "circle"; x: number; y: number; r: number }
  | { type: "arrow"; x1: number; y1: number; x2: number; y2: number }
  | { type: "freehand"; points: { x: number; y: number }[] };

export type FeedbackTarget = { selector: string; text: string };

export const feedback = pgTable(
  "feedback",
  {
    id: text("id").primaryKey(),
    authorUserId: text("author_user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    authorRole: text("author_role").notNull(),
    type: text("type").notNull(),
    priority: text("priority").notNull(),
    title: text("title"),
    body: text("body").notNull(),
    url: text("url").notNull(),
    route: text("route").notNull(),
    selector: text("selector"),
    elementText: text("element_text"),
    targets: jsonb("targets").$type<FeedbackTarget[]>().notNull().default(sql`'[]'::jsonb`),
    marks: jsonb("marks").$type<FeedbackMark[]>().notNull().default(sql`'[]'::jsonb`),
    viewport: jsonb("viewport").$type<FeedbackViewport>().notNull(),
    device: text("device").notNull().default("desktop"),
    screenshotKey: text("screenshot_key"),
    sensitive: boolean("sensitive").notNull().default(false),
    status: text("status").notNull(),
    approvedBy: text("approved_by").references(() => user.id, { onDelete: "set null" }),
    approvedAt: ts("approved_at"),
    fixPrUrl: text("fix_pr_url"),
    fixNotes: text("fix_notes"),
    mergedIntoId: text("merged_into_id"),
    authorReadAt: ts("author_read_at"),
    inboxReadAt: ts("inbox_read_at"),
    isDemo: boolean("is_demo").notNull().default(false),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("feedback_status").on(table.status),
    index("feedback_author").on(table.authorUserId),
    index("feedback_route").on(table.route),
  ],
);

export const feedbackEvents = pgTable(
  "feedback_events",
  {
    id: text("id").primaryKey(),
    feedbackId: text("feedback_id").notNull().references(() => feedback.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    body: text("body").notNull().default(""),
    actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),
    actorName: text("actor_name"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (table) => [index("feedback_events_feedback").on(table.feedbackId, table.createdAt)],
);

export const feedbackDeliveries = pgTable("feedback_deliveries", {
  id: text("id").primaryKey(),
  feedbackId: text("feedback_id").notNull().references(() => feedback.id, { onDelete: "cascade" }),
  attempt: integer("attempt").notNull(),
  status: text("status").notNull(),
  httpStatus: integer("http_status"),
  error: text("error"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const services = pgTable("services", {
  id: text("id").primaryKey(),
  teacherId: text("teacher_id").notNull().references(() => teachers.id, { onDelete: "cascade" }),
  categoryId: text("category_id").notNull().references(() => categories.id),
  subcategoryId: text("subcategory_id").references(() => categories.id),
  locationId: text("location_id").references(() => locations.id),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  kind: text("kind").notNull(),
  bufferMinutes: integer("buffer_minutes").notNull().default(0),
  leadTimeHours: integer("lead_time_hours").notNull().default(2),
  cancellationHours: integer("cancellation_hours").notNull().default(24),
  slotMinutes: integer("slot_minutes"),
  capacity: integer("capacity").notNull().default(1),
  priceCents: integer("price_cents").notNull().default(0),
  waiverRequired: boolean("waiver_required").notNull().default(false),
  status: text("status").notNull().default("draft"),
  coverImageUrl: text("cover_image_url"),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const serviceOptions = pgTable("service_options", {
  id: text("id").primaryKey(),
  serviceId: text("service_id").notNull().references(() => services.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  minutes: integer("minutes").notNull(),
  priceCents: integer("price_cents").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const serviceAddons = pgTable("service_addons", {
  id: text("id").primaryKey(),
  serviceId: text("service_id").notNull().references(() => services.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  priceCents: integer("price_cents").notNull(),
  minutes: integer("minutes").notNull().default(0),
});

export const availabilityWindows = pgTable("availability_windows", {
  id: text("id").primaryKey(),
  serviceId: text("service_id").notNull().references(() => services.id, { onDelete: "cascade" }),
  weekday: integer("weekday").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
});

export const accessSlots = pgTable(
  "access_slots",
  {
    id: text("id").primaryKey(),
    serviceId: text("service_id").notNull().references(() => services.id, { onDelete: "cascade" }),
    startsAt: ts("starts_at").notNull(),
    capacity: integer("capacity").notNull(),
  },
  (table) => [uniqueIndex("access_slot_unique").on(table.serviceId, table.startsAt)],
);

export const visitBookings = pgTable("visit_bookings", {
  id: text("id").primaryKey(),
  orderId: text("order_id").references(() => orders.id, { onDelete: "set null" }),
  userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
  serviceId: text("service_id").notNull().references(() => services.id, { onDelete: "cascade" }),
  optionId: text("option_id"),
  offeringKind: text("offering_kind").notNull(),
  startsAt: ts("starts_at").notNull(),
  endsAt: ts("ends_at").notNull(),
  status: text("status").notNull().default("confirmed"),
  addonIds: text("addon_ids").array().notNull().default(sql`ARRAY[]::text[]`),
  packPurchaseId: text("pack_purchase_id"),
  membershipSubscriptionId: text("membership_subscription_id"),
  waiverSignatureId: text("waiver_signature_id"),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: ts("created_at").notNull().defaultNow(),
  cancelledAt: ts("cancelled_at"),
});

export const waivers = pgTable(
  "waivers",
  {
    id: text("id").primaryKey(),
    teacherId: text("teacher_id").notNull().references(() => teachers.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    version: integer("version").notNull().default(1),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("waivers_teacher").on(table.teacherId)],
);

export const waiverSignatures = pgTable(
  "waiver_signatures",
  {
    id: text("id").primaryKey(),
    waiverId: text("waiver_id").notNull().references(() => waivers.id, { onDelete: "cascade" }),
    teacherId: text("teacher_id").notNull().references(() => teachers.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    signedName: text("signed_name").notNull(),
    ip: text("ip"),
    signedAt: ts("signed_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("waiver_signature_version").on(table.teacherId, table.userId, table.version)],
);

export const credentials = pgTable("credentials", {
  id: text("id").primaryKey(),
  teacherId: text("teacher_id").notNull().references(() => teachers.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  identifier: text("identifier"),
  verified: boolean("verified").notNull().default(false),
  verifiedAt: ts("verified_at"),
  verifiedBy: text("verified_by"),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const uploadTokens = pgTable("upload_tokens", {
  token: text("token").primaryKey(),
  key: text("key").notNull(),
  contentType: text("content_type").notNull(),
  userId: text("user_id").notNull(),
  classId: text("class_id"),
  teacherId: text("teacher_id"),
  purpose: text("purpose").notNull(),
  expiresAt: ts("expires_at").notNull(),
  used: boolean("used").notNull().default(false),
});
