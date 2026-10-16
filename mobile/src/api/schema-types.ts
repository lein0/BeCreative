import type {
  bookings,
  categories,
  classes,
  locations,
  memberships,
  orders,
  packs,
  sessions,
  teachers,
} from "../../../lib/db/schema";

/** Drizzle row types reused from the web schema. API DTOs pick these fields so a column rename fails typecheck. */
export type ClassRow = typeof classes.$inferSelect;
export type TeacherRow = typeof teachers.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
export type BookingRow = typeof bookings.$inferSelect;
export type OrderRow = typeof orders.$inferSelect;
export type PackRow = typeof packs.$inferSelect;
export type MembershipRow = typeof memberships.$inferSelect;
export type CategoryRow = typeof categories.$inferSelect;
export type LocationRow = typeof locations.$inferSelect;

export type ApiClassCore = Pick<
  ClassRow,
  | "id"
  | "slug"
  | "title"
  | "description"
  | "outcomes"
  | "prerequisites"
  | "whatToBring"
  | "skillLevel"
  | "format"
  | "delivery"
  | "durationMinutes"
  | "maxSize"
  | "pricePerSessionCents"
  | "pricePerSeriesCents"
  | "seriesBookingEnabled"
  | "firstClassFree"
>;

export type ApiTeacherCore = Pick<TeacherRow, "id" | "slug" | "studioName" | "bio" | "specialties" | "instagram" | "website">;

export type ApiCategoryCore = Pick<CategoryRow, "id" | "slug" | "name" | "parentId">;

export type ApiOrderMoney = Pick<
  OrderRow,
  | "listPriceCents"
  | "discountCents"
  | "studentPaysCents"
  | "platformFeeCents"
  | "teacherAmountCents"
  | "paymentPath"
  | "status"
>;
