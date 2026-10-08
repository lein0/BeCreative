export type Vertical = "creative" | "wellness";
export type PlatformName = "ios" | "android" | "web";

export type StudentUser = {
  id: string;
  name: string;
  email: string;
  roles?: string[];
};

export type AuthResult = {
  token: string;
  user: StudentUser;
};

export type PublicClass = {
  id: string;
  slug: string;
  title: string;
  priceCents: number | null;
  delivery: string;
  teacher: string;
  teacherSlug: string;
  category?: string;
  vertical?: Vertical;
  nextStartsAt: string | null;
  spots: number | null;
};

export type Slot = { id: string; startsAt: string; spots: number | null };

export type ClassDetail = {
  class: PublicClass;
  description: string;
  slots: Slot[];
  teacher: { slug: string; name: string };
};

export type TeacherProfile = {
  teacher: { slug: string; name: string; bio: string | null };
  classes: { id: string; slug: string; title: string }[];
};

export type ServiceHit = { id: string; slug: string; title: string; teacher: string };

export type ExploreQuery = {
  q?: string;
  category?: string;
  vertical?: Vertical | string;
  level?: string;
  format?: string;
};

export type PriceBreakdown = {
  listPriceCents?: number;
  discountCents?: number;
  studentPaysCents?: number;
  codeApplied?: string | null;
};

export type CheckoutResult = PriceBreakdown & {
  error?: string;
  orderId?: string;
  clientSecret?: string;
  publishableKey?: string;
  checkoutUrl?: string;
  waitlisted?: boolean;
  alreadyBooked?: boolean;
  ok?: boolean;
};

export type BookInput = {
  sessionId?: string;
  classId?: string;
  series?: boolean;
  code?: string;
  payWith?: string;
  policyAccepted?: boolean;
  paymentSheet?: boolean;
};

export type BookingListItem = {
  id: string;
  status: string;
  title: string;
  slug: string;
  createdAt: string;
};

export type WalletPack = { id: string; name: string; remaining: number; total: number };
export type WalletMembership = { id: string; name: string; status: string; periodEnd: string };
export type Wallet = { packs: WalletPack[]; memberships: WalletMembership[] };

export type WaiverState = { body: string | null; version: number | null; signed: boolean };

export type AppNotification = {
  id: string;
  event: string;
  title: string;
  body: string;
  href: string | null;
  readAt: string | null;
  createdAt: string;
};

export type PreferenceRow = {
  id: string;
  event: string;
  email: boolean;
  inApp: boolean;
  sms: boolean;
  push: boolean;
  cadence: string;
};

export type Preferences = {
  preferences: PreferenceRow[];
  smsOptIn: boolean;
  marketingOptIn: boolean;
  phone: string | null;
};

export type PreferenceUpdate = {
  event?: string;
  email?: boolean;
  inApp?: boolean;
  sms?: boolean;
  push?: boolean;
  cadence?: "instant" | "daily";
  smsOptIn?: boolean;
  marketingOptIn?: boolean;
  phone?: string;
};

export type HelpArticleSummary = { slug: string; title: string; category: string };
export type HelpArticle = HelpArticleSummary & { body: string };

export type TicketSummary = { id: string; subject: string; status: string; category: string };

export type TrackInput = {
  name: string;
  anonymousId?: string;
  path?: string;
  platform?: PlatformName;
  consent?: boolean;
  properties?: Record<string, string>;
};

export type ExperimentAssignment = {
  key: string;
  variant: string;
  payload?: Record<string, string> | null;
  goalEvent?: string;
  status?: string;
};

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export type StudentApi = {
  mode: "mock" | "live";
  signIn(input: { email: string; password: string; anonymousId?: string }): Promise<AuthResult>;
  signUp(input: { name: string; email: string; password: string; phone?: string; smsOptIn?: boolean; marketingOptIn?: boolean; anonymousId?: string }): Promise<AuthResult>;
  signOut(): Promise<{ ok: true }>;
  me(): Promise<{ user: StudentUser }>;
  explore(query?: ExploreQuery): Promise<{ classes: PublicClass[] }>;
  search(query?: { q?: string; vertical?: string }): Promise<{ classes: PublicClass[]; services: ServiceHit[] }>;
  classDetail(slug: string): Promise<ClassDetail>;
  slots(slug: string): Promise<{ slots: Slot[] }>;
  teacher(slug: string): Promise<TeacherProfile>;
  book(input: BookInput): Promise<CheckoutResult>;
  cancelBooking(id: string): Promise<{ ok?: boolean; outcome?: string; feeCents?: number; error?: string }>;
  rescheduleBooking(id: string, sessionId: string): Promise<{ ok?: boolean; error?: string }>;
  bookings(): Promise<{ bookings: BookingListItem[] }>;
  wallet(): Promise<Wallet>;
  purchasePack(input: { id: string; code?: string; paymentSheet?: boolean }): Promise<CheckoutResult>;
  purchaseMembership(input: { id: string; code?: string }): Promise<CheckoutResult>;
  waiver(teacherSlug: string): Promise<WaiverState>;
  signWaiver(teacherSlug: string, signedName: string): Promise<{ ok?: boolean; error?: string }>;
  notifications(): Promise<{ notifications: AppNotification[] }>;
  markNotificationsRead(id?: string): Promise<{ ok: true }>;
  preferences(): Promise<Preferences>;
  updatePreferences(body: PreferenceUpdate): Promise<{ ok: true }>;
  registerPushToken(input: { token: string; platform?: PlatformName; provider?: "expo" | "apns" | "fcm" }): Promise<{ ok: true }>;
  unregisterPushToken(token: string): Promise<{ ok: true }>;
  help(): Promise<{ articles: HelpArticleSummary[] }>;
  helpArticle(slug: string): Promise<HelpArticle>;
  tickets(): Promise<{ tickets: TicketSummary[] }>;
  createTicket(input: { category?: string; subject: string; body: string; teacherId?: string; bookingId?: string }): Promise<{ id: string }>;
  track(input: TrackInput): Promise<{ ok: true }>;
  experiment(key: string, subject?: string): Promise<ExperimentAssignment>;
};
