import type { PriceQuote } from "../../../lib/pricing";
import type { ApiCategoryCore, ApiClassCore, ApiOrderMoney, ApiTeacherCore } from "./schema-types";

export type Vertical = "creative" | "wellness";
export type OfferingKind = "class" | "appointment" | "capacity";
export type BookingKind = "session" | "series" | "appointment" | "capacity";
export type BookingStatus = "pending" | "confirmed" | "waitlisted" | "cancelled";
export type RefundKind = "full" | "credit" | "none";
export type TrackPlatform = "ios" | "android";

export type StudentUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  phone: string | null;
  smsOptIn: boolean;
  imageUrl: string | null;
};

export type AuthSession = {
  token: string;
  expiresAt: string;
  user: StudentUser;
};

export type Category = ApiCategoryCore & { vertical: Vertical };

export type Neighborhood = { name: string; lat: number; lng: number };

export type Catalog = {
  categories: Category[];
  neighborhoods: Neighborhood[];
  feePercent: number;
  feeFixedCents: number;
};

export type ClassCard = Pick<
  ApiClassCore,
  | "id"
  | "slug"
  | "title"
  | "skillLevel"
  | "format"
  | "delivery"
  | "durationMinutes"
  | "pricePerSessionCents"
  | "pricePerSeriesCents"
  | "firstClassFree"
> & {
  teacherName: string;
  teacherSlug: string;
  vertical: Vertical;
  categorySlug: string;
  categoryName: string;
  neighborhood: string | null;
  lat: number | null;
  lng: number | null;
  nextStartsAt: string | null;
  offeringKind: OfferingKind;
  coverHue: number;
};

export type ExploreQuery = {
  q?: string;
  category?: string;
  vertical?: Vertical;
  date?: string;
  maxPriceCents?: number;
  neighborhood?: string;
  free?: boolean;
  firstClassFree?: boolean;
  lat?: number;
  lng?: number;
  miles?: number;
};

export type ExploreResult = { classes: ClassCard[]; nextCursor: string | null };

export type ClassSession = {
  id: string;
  startsAt: string;
  endsAt: string;
  localDate: string;
  status: "scheduled" | "cancelled" | "completed" | "paused";
  capacity: number;
  confirmedCount: number;
};

export type TimeSlot = {
  id: string;
  startsAt: string;
  endsAt: string;
  remaining: number;
  priceCents: number;
};

export type Addon = { id: string; name: string; priceCents: number; minutes: number };

export type Waiver = { required: boolean; title: string; body: string };

export type Review = { id: string; rating: number; body: string; author: string };

export type PackOffer = {
  id: string;
  slug: string;
  name: string;
  description: string;
  creditCount: number;
  priceCents: number;
  expiryDays: number;
};

export type MembershipOffer = {
  id: string;
  slug: string;
  name: string;
  description: string;
  termMonths: number;
  priceCents: number;
  classesPerPeriod: number | null;
  unlimited: boolean;
  pauseCancelPolicy: string;
};

export type ClassDetail = ApiClassCore & {
  vertical: Vertical;
  offeringKind: OfferingKind;
  categorySlug: string;
  categoryName: string;
  coverHue: number;
  teacher: ApiTeacherCore & { neighborhood: string | null };
  location: { neighborhood: string; city: string; lat: number; lng: number; addressLine1: string } | null;
  sessions: ClassSession[];
  slots: TimeSlot[];
  addons: Addon[];
  waiver: Waiver;
  reviews: Review[];
  packs: PackOffer[];
  memberships: MembershipOffer[];
  introAlreadyUsed: boolean;
};

export type TeacherProfile = ApiTeacherCore & {
  vertical: Vertical;
  neighborhood: string | null;
  classes: ClassCard[];
  packs: PackOffer[];
  memberships: MembershipOffer[];
};

export type QuoteRequest = {
  classSlug: string;
  kind: BookingKind;
  sessionId?: string | null;
  slotId?: string | null;
  addonIds?: string[];
  partySize?: number;
  promoCode?: string | null;
  usePackId?: string | null;
  useMembershipId?: string | null;
};

export type QuoteResponse = {
  quote: PriceQuote;
  listPriceCents: number;
  label: string;
};

export type PaymentSheetParams = {
  paymentIntentClientSecret: string;
  customerId: string;
  customerEphemeralKeySecret: string;
  merchantDisplayName: string;
  publishableKey: string;
  merchantCountryCode: string;
  applePayMerchantId: string;
  googlePayTestEnv: boolean;
};

export type BookingRecord = {
  id: string;
  classSlug: string;
  classTitle: string;
  teacherName: string;
  kind: BookingKind;
  status: BookingStatus;
  startsAt: string;
  endsAt: string;
  location: string;
  sessionId: string | null;
  slotId: string | null;
  partySize: number;
  orderId: string | null;
};

export type OrderRecord = ApiOrderMoney & {
  id: string;
  bookingId: string | null;
  classTitle: string;
  kind: BookingKind;
  promoCode: string | null;
  payment: PaymentSheetParams | null;
  createdAt: string;
};

export type BookingResult = {
  booking: BookingRecord;
  order: OrderRecord;
};

export type CreateBookingRequest = QuoteRequest & {
  waiver?: { agreed: boolean; signedName: string };
};

export type CancelResult = {
  booking: BookingRecord;
  refund: RefundKind;
  message: string;
};

export type WalletPack = {
  id: string;
  packId: string;
  name: string;
  teacherName: string;
  creditsTotal: number;
  creditsRemaining: number;
  expiresAt: string | null;
  classSlugs: string[];
  categorySlugs: string[];
};

export type WalletMembership = {
  id: string;
  membershipId: string;
  name: string;
  teacherName: string;
  status: "active" | "pending" | "cancelled";
  currentPeriodEnd: string;
  classesPerPeriod: number | null;
  classesUsedThisPeriod: number;
  unlimited: boolean;
  classSlugs: string[];
  categorySlugs: string[];
};

export type LedgerEntry = {
  id: string;
  direction: "credit" | "debit";
  sourceType: string;
  label: string;
  createdAt: string;
};

export type Wallet = { packs: WalletPack[]; memberships: WalletMembership[]; ledger: LedgerEntry[] };

export type AppNotification = {
  id: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  href: string | null;
};

export type NotificationPreferences = {
  pushBookings: boolean;
  pushReminders: boolean;
  pushMarketing: boolean;
  smsOptIn: boolean;
};

export type FaqItem = { id: string; question: string; answer: string };

export type HelpAction = {
  id: "cancel" | "reschedule" | "waiver_copy" | "ask_teacher" | "safety";
  label: string;
  enabled: boolean;
  detail: string;
};

export type SupportTicket = {
  id: string;
  bookingId: string | null;
  subject: string;
  body: string;
  status: "open" | "pending" | "closed";
  createdAt: string;
};

export type TrackEvent = {
  event: string;
  platform: TrackPlatform;
  occurredAt: string;
  anonymousId: string;
  userId: string | null;
  properties: Record<string, string | number | boolean | null>;
};

export type ExperimentAssignment = { key: string; variant: string };

export type PushRegistration = {
  expoPushToken: string;
  platform: TrackPlatform;
};

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export type StudentApi = {
  mode: "mock" | "live";
  catalog(): Promise<Catalog>;
  explore(query?: ExploreQuery): Promise<ExploreResult>;
  classDetail(slug: string): Promise<ClassDetail>;
  teacher(slug: string): Promise<TeacherProfile>;
  quote(input: QuoteRequest): Promise<QuoteResponse>;
  createBooking(input: CreateBookingRequest, idempotencyKey?: string): Promise<BookingResult>;
  confirmPayment(orderId: string, paymentIntentId: string): Promise<OrderRecord>;
  getOrder(orderId: string): Promise<OrderRecord>;
  cancelBooking(id: string): Promise<CancelResult>;
  rescheduleBooking(id: string, target: { sessionId?: string; slotId?: string }): Promise<BookingRecord>;
  bookings(): Promise<{ bookings: BookingRecord[] }>;
  booking(id: string): Promise<BookingRecord>;
  wallet(): Promise<Wallet>;
  signup(input: { name: string; email: string; password: string }): Promise<{ verificationRequired: boolean; user: StudentUser }>;
  login(input: { email: string; password: string }): Promise<AuthSession>;
  loginWithGoogle(input: { idToken: string }): Promise<AuthSession>;
  loginWithApple(input: { idToken: string; nonce?: string | null; fullName?: { givenName?: string | null; familyName?: string | null } | null }): Promise<AuthSession>;
  verifyEmail(input: { email?: string; code?: string; token?: string }): Promise<AuthSession>;
  resendVerification(email: string): Promise<{ sent: boolean }>;
  forgotPassword(email: string): Promise<{ sent: boolean }>;
  resetPassword(input: { token: string; password: string }): Promise<{ reset: boolean }>;
  logout(): Promise<{ ok: true }>;
  me(): Promise<StudentUser>;
  updateMe(patch: { name?: string; phone?: string | null; smsOptIn?: boolean }): Promise<StudentUser>;
  deleteMe(confirm: string): Promise<{ deleted: true }>;
  registerPushToken(input: PushRegistration): Promise<{ registered: true }>;
  unregisterPushToken(token: string): Promise<{ removed: true }>;
  notifications(): Promise<{ items: AppNotification[] }>;
  markNotificationRead(id: string): Promise<AppNotification>;
  notificationPreferences(): Promise<NotificationPreferences>;
  updateNotificationPreferences(patch: Partial<NotificationPreferences>): Promise<NotificationPreferences>;
  faq(): Promise<{ items: FaqItem[] }>;
  helpActions(bookingId: string): Promise<{ actions: HelpAction[] }>;
  tickets(): Promise<{ tickets: SupportTicket[] }>;
  createTicket(input: { bookingId?: string | null; subject: string; body: string }): Promise<SupportTicket>;
  track(event: TrackEvent): Promise<{ accepted: true }>;
  experiments(): Promise<{ assignments: ExperimentAssignment[] }>;
};
