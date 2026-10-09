import { quotePrice } from "../../../lib/pricing";
import { DEMO_EMAIL, DEMO_PASSWORD, DEMO_PROMO } from "./fixtures";
import { ApiError, type AppNotification, type BookingListItem, type ClassDetail, type Place, type Preferences, type PublicClass, type StudentApi, type StudentUser, type TrackInput, type Wallet } from "./types";

type MockClass = PublicClass & { description: string; seriesCents: number | null; signatureRequired: boolean };

const NOW = Date.now();
const day = 86_400_000;

function iso(offsetDays: number, hour: number) {
  const date = new Date(NOW + offsetDays * day);
  date.setUTCHours(hour, 0, 0, 0);
  return date.toISOString();
}

function place(lat: number, lng: number, neighborhood: string, name: string): Place {
  return { lat, lng, neighborhood, name, city: "Los Angeles" };
}

const SCENE_PLACE = place(34.09, -118.34, "Los Feliz", "Studio B");
const FLOW_PLACE = place(34.05, -118.25, "Silver Lake", "The Loft");

const CLASSES: MockClass[] = [
  {
    id: "class-scene",
    slug: "scene-study",
    title: "Scene Study",
    priceCents: 3600,
    delivery: "in_person",
    teacher: "Maya Alvarez",
    teacherSlug: "maya-alvarez",
    category: "acting",
    vertical: "creative",
    nextStartsAt: iso(3, 19),
    spots: 8,
    lat: SCENE_PLACE.lat,
    lng: SCENE_PLACE.lng,
    neighborhood: SCENE_PLACE.neighborhood,
    location: SCENE_PLACE,
    description: "Hold a scene without indicating. Bring the sides, water, and shoes you can move in.",
    seriesCents: 24000,
    signatureRequired: true,
  },
  {
    id: "class-flow",
    slug: "morning-flow",
    title: "Morning Flow",
    priceCents: 2800,
    delivery: "in_person",
    teacher: "Lena Ortiz",
    teacherSlug: "lena-ortiz",
    category: "yoga",
    vertical: "wellness",
    nextStartsAt: iso(1, 15),
    spots: 6,
    lat: FLOW_PLACE.lat,
    lng: FLOW_PLACE.lng,
    neighborhood: FLOW_PLACE.neighborhood,
    location: FLOW_PLACE,
    description: "A calm vinyasa hour. Not medical care.",
    seriesCents: null,
    signatureRequired: false,
  },
  {
    id: "class-sauna",
    slug: "cedar-sauna",
    title: "Cedar Sauna",
    priceCents: 4000,
    delivery: "in_person",
    teacher: "Lena Ortiz",
    teacherSlug: "lena-ortiz",
    category: "sauna",
    vertical: "wellness",
    nextStartsAt: iso(2, 18),
    spots: 4,
    lat: 34.08,
    lng: -118.36,
    neighborhood: "Hollywood",
    location: place(34.08, -118.36, "Hollywood", "Cedar room"),
    description: "A shared sauna hour. Stop if you feel unwell.",
    seriesCents: null,
    signatureRequired: false,
  },
  {
    id: "class-table",
    slug: "table-read",
    title: "Table Read",
    priceCents: 0,
    delivery: "virtual",
    teacher: "Maya Alvarez",
    teacherSlug: "maya-alvarez",
    category: "acting",
    vertical: "creative",
    nextStartsAt: iso(4, 18),
    spots: 12,
    lat: null,
    lng: null,
    neighborhood: null,
    location: null,
    description: "Read the scene from home.",
    seriesCents: null,
    signatureRequired: true,
  },
];

const DEMO_USER: StudentUser = { id: "user-student", name: "Jules Navarro", email: DEMO_EMAIL, roles: ["student"] };

function publicOf(item: MockClass): PublicClass {
  const { description: _description, seriesCents: _series, signatureRequired: _signature, ...card } = item;
  return card;
}

function bookingRow(id: string, item: MockClass, status: string): BookingListItem {
  return {
    id,
    status,
    title: item.title,
    slug: item.slug,
    createdAt: new Date(NOW - day).toISOString(),
    startsAt: item.nextStartsAt,
    endsAt: item.nextStartsAt ? new Date(new Date(item.nextStartsAt).getTime() + 90 * 60_000).toISOString() : null,
    timezone: "America/Los_Angeles",
    location: item.delivery === "virtual" ? null : item.location ?? null,
  };
}

type State = {
  token: string | null;
  bookings: BookingListItem[];
  wallet: Wallet;
  signed: Set<string>;
  notifications: AppNotification[];
  preferences: Preferences;
  tickets: { id: string; subject: string; status: string; category: string }[];
  events: TrackInput[];
};

function fresh(): State {
  return {
    token: null,
    bookings: [bookingRow("book-scene", CLASSES[0]!, "confirmed")],
    wallet: {
      packs: [{ id: "pack-1", name: "Scene 5-pack", remaining: 4, total: 5, classIds: ["class-scene"], categoryIds: [], teacherId: "maya-alvarez" }],
      memberships: [{ id: "mem-1", name: "BeWell monthly", status: "active", periodEnd: iso(28, 12) }],
    },
    signed: new Set(),
    notifications: [
      { id: "note-1", event: "booking.confirmed", title: "You're booked for Scene Study", body: "See you in class.", href: "/bookings", readAt: null, createdAt: new Date(NOW - 3_600_000).toISOString() },
    ],
    preferences: { preferences: [], smsOptIn: false, marketingOptIn: false, phone: null },
    tickets: [],
    events: [],
  };
}

export type MockApi = StudentApi & { recordedEvents: TrackInput[] };

export function createMockApi(): MockApi {
  const state = fresh();

  function user(): StudentUser {
    if (state.token !== `bc_${DEMO_USER.id}`) throw new ApiError(401, "Sign in required.");
    return DEMO_USER;
  }

  function findClass(slugOrId: string) {
    return CLASSES.find((item) => item.slug === slugOrId || item.id === slugOrId) ?? null;
  }

  const api: MockApi = {
    mode: "mock",
    recordedEvents: state.events,
    async signIn(input) {
      if (input.email.toLowerCase() !== DEMO_EMAIL || input.password !== DEMO_PASSWORD) throw new ApiError(401, "Check the email and password.");
      state.token = `bc_${DEMO_USER.id}`;
      return { token: state.token, user: DEMO_USER };
    },
    async signUp(input) {
      if (!input.email || input.password.length < 8) throw new ApiError(400, "Could not create the account.");
      state.token = `bc_${DEMO_USER.id}`;
      return { token: state.token, user: { ...DEMO_USER, name: input.name || DEMO_USER.name, email: input.email } };
    },
    async signInSocial(input) {
      if (!input.provider || !input.idToken) throw new ApiError(400, "provider and idToken are required.");
      if (input.idToken === "unconfigured") {
        throw new ApiError(503, `${input.provider === "apple" ? "Apple" : "Google"} sign-in is not configured.`);
      }
      state.token = `bc_${DEMO_USER.id}`;
      return { token: state.token, user: DEMO_USER };
    },
    async requestPasswordReset(email) {
      if (!email.includes("@")) throw new ApiError(400, "Enter an email address.");
      return { ok: true };
    },
    async confirmPasswordReset(input) {
      if (!input.token) throw new ApiError(400, "That reset link is not valid.");
      if (input.password.length < 8) throw new ApiError(400, "Use at least 8 characters.");
      return { ok: true };
    },
    async requestEmailVerification(email) {
      if (!email.includes("@")) throw new ApiError(400, "Enter an email address.");
      return { ok: true };
    },
    async confirmEmailVerification(token) {
      if (!token) throw new ApiError(400, "That verification link is not valid.");
      return { ok: true };
    },
    async signOut() {
      state.token = null;
      return { ok: true };
    },
    async deleteAccount(input) {
      user();
      if (input.password) {
        if (input.password !== DEMO_PASSWORD) throw new ApiError(401, "That password doesn't match this account.");
      } else if (input.idToken && (input.provider === "apple" || input.provider === "google")) {
        if (input.idToken === "unconfigured") {
          throw new ApiError(503, `${input.provider === "apple" ? "Apple" : "Google"} sign-in is not configured.`);
        }
      } else {
        throw new ApiError(400, "Confirm your password or sign in with Apple or Google again.");
      }
      state.token = null;
      return { ok: true };
    },
    async me() {
      return { user: user() };
    },
    async explore(query = {}) {
      const q = (query.q || "").toLowerCase();
      const classes = CLASSES.filter((item) => {
        if (query.vertical && item.vertical !== query.vertical) return false;
        if (query.category && item.category !== query.category) return false;
        if (q && !`${item.title} ${item.teacher} ${item.category}`.toLowerCase().includes(q)) return false;
        return true;
      }).map(publicOf);
      return { classes };
    },
    async search(query = {}) {
      const found = await api.explore(query);
      return { classes: found.classes, services: query.vertical === "creative" ? [] : [{ id: "svc-sauna", slug: "cedar-sauna", title: "Cedar Sauna", teacher: "Lena Ortiz" }] };
    },
    async classDetail(slug) {
      const item = findClass(slug);
      if (!item) throw new ApiError(404, "Class not found.");
      const detail: ClassDetail = {
        class: { ...publicOf(item), seriesPriceCents: item.seriesCents, categoryId: item.category },

        description: item.description,
        slots: [0, 1, 2].map((index) => ({ id: `${item.slug}-slot-${index}`, startsAt: iso(index + 1, 19), spots: 6 })),
        teacher: { id: item.teacherSlug, slug: item.teacherSlug, name: item.teacher },
        signatureRequired: item.signatureRequired,
        policyAcknowledgementRequired: true,
      };
      return detail;
    },
    async slots(slug) {
      const detail = await api.classDetail(slug);
      return { slots: detail.slots };
    },
    async teacher(slug) {
      const owned = CLASSES.filter((item) => item.teacherSlug === slug);
      if (!owned.length) throw new ApiError(404, "Teacher not found.");
      const maya = slug === "maya-alvarez";
      return {
        teacher: { slug, name: owned[0]!.teacher, bio: "Independent teacher on BeCreative." },
        classes: owned.map((item) => ({ id: item.id, slug: item.slug, title: item.title })),
        packs: maya
          ? [{ id: "pack-scene", slug: "scene-5", name: "Scene 5-pack", priceCents: 15000, creditCount: 5 }]
          : [{ id: "pack-flow", slug: "flow-5", name: "5-visit pack", priceCents: 12000, creditCount: 5 }],
        memberships: maya ? [] : [{ id: "plan-bewell", slug: "bewell-monthly", name: "BeWell monthly", priceCents: 8900 }],
      };
    },
    async book(input) {
      user();
      if (!input.policyAccepted) throw new ApiError(400, "Accept the cancellation policy.");
      const item = findClass(input.classId || input.sessionId?.split("-slot")[0] || "scene-study") || CLASSES[0]!;
      const list = input.series ? item.seriesCents ?? item.priceCents ?? 0 : item.priceCents ?? 0;
      const code = input.code?.trim().toUpperCase();
      if (code && code !== DEMO_PROMO.code) throw new ApiError(400, "That code isn't recognized.");
      const quote = quotePrice({ listPriceCents: list, feePercent: 10, feeFixedCents: 0, promo: code ? DEMO_PROMO : null });
      const orderId = `order-${state.bookings.length + 1}`;
      state.bookings.unshift({ ...bookingRow(`book-${state.bookings.length + 1}`, item, "confirmed"), createdAt: new Date().toISOString() });
      if (quote.studentPaysCents === 0) return { orderId, ...quoteFields(quote) };
      return {
        orderId,
        clientSecret: `pi_mock_secret_${orderId}`,
        publishableKey: "pk_test_mock",
        ...quoteFields(quote),
      };
    },
    async cancelBooking(id) {
      user();
      const row = state.bookings.find((item) => item.id === id);
      if (!row || row.status === "cancelled") throw new ApiError(400, "Booking not found.");
      row.status = "cancelled";
      return { ok: true, outcome: "full_refund", feeCents: 0 };
    },
    async rescheduleBooking(id, sessionId) {
      user();
      if (!sessionId) throw new ApiError(400, "That date is not open.");
      const row = state.bookings.find((item) => item.id === id);
      if (!row || row.status !== "confirmed") throw new ApiError(400, "Booking not found.");
      return { ok: true };
    },
    async bookings() {
      user();
      return { bookings: state.bookings };
    },
    async wallet() {
      user();
      return state.wallet;
    },
    async purchasePack(input) {
      user();
      const quote = quotePrice({ listPriceCents: 15000, feePercent: 10, feeFixedCents: 0, promo: input.code ? DEMO_PROMO : null });
      return { orderId: "order-pack", clientSecret: "pi_mock_secret_pack", publishableKey: "pk_test_mock", ...quoteFields(quote) };
    },
    async purchaseMembership() {
      user();
      const quote = quotePrice({ listPriceCents: 8900, feePercent: 10, feeFixedCents: 0 });
      return { orderId: "order-membership", checkoutUrl: "https://checkout.stripe.test/c/mock_membership", ...quoteFields(quote) };
    },
    async waiver(teacherSlug) {
      user();
      const required = teacherSlug === "maya-alvarez";
      return {
        body: required ? "I understand this class is taught by an independent teacher." : null,
        version: required ? 1 : null,
        signed: state.signed.has(teacherSlug),
        required,
        policyAcknowledgementRequired: true,
      };
    },
    async signWaiver(teacherSlug, signedName) {
      user();
      if (!signedName.trim()) throw new ApiError(400, "Type your name to sign.");
      state.signed.add(teacherSlug);
      return { ok: true };
    },
    async notifications() {
      user();
      return { notifications: state.notifications };
    },
    async markNotificationsRead(id) {
      user();
      for (const item of state.notifications) {
        if (!id || item.id === id) item.readAt = new Date().toISOString();
      }
      return { ok: true };
    },
    async preferences() {
      user();
      return state.preferences;
    },
    async updatePreferences(body) {
      user();
      state.preferences = {
        ...state.preferences,
        smsOptIn: body.smsOptIn ?? state.preferences.smsOptIn,
        marketingOptIn: body.marketingOptIn ?? state.preferences.marketingOptIn,
        phone: body.phone === undefined ? state.preferences.phone : body.phone || null,
      };
      return { ok: true };
    },
    async registerPushToken(input) {
      user();
      if (!input.token) throw new ApiError(400, "Token required.");
      return { ok: true };
    },
    async unregisterPushToken() {
      user();
      return { ok: true };
    },
    async help() {
      return {
        articles: [
          { slug: "how-booking-works", title: "How booking works", category: "booking" },
          { slug: "refunds-and-cancellations", title: "Refunds and cancellations", category: "refunds" },
        ],
      };
    },
    async helpArticle(slug) {
      const list = await api.help();
      const article = list.articles.find((item) => item.slug === slug);
      if (!article) throw new ApiError(404, "Article not found.");
      return { ...article, body: "Pick a class, accept the policy, and pay by card or at the studio." };
    },
    async tickets() {
      user();
      return { tickets: state.tickets };
    },
    async createTicket(input) {
      user();
      const id = `ticket-${state.tickets.length + 1}`;
      state.tickets.unshift({ id, subject: input.subject, status: "open", category: input.category || "class" });
      return { id };
    },
    async track(input) {
      if (input.platform !== "ios" && input.platform !== "android" && input.platform !== "web") throw new ApiError(400, "Unknown event.");
      state.events.push(input);
      return { ok: true };
    },
    async experiment(key) {
      if (key !== "class_cta") throw new ApiError(404, "Experiment not found.");
      return { key, variant: "book_this", payload: { label: "Book this session" }, goalEvent: "checkout_completed", status: "running" };
    },
  };
  return api;
}

function quoteFields(quote: { listPriceCents: number; discountCents: number; studentPaysCents: number; codeApplied: string | null }) {
  return {
    listPriceCents: quote.listPriceCents,
    discountCents: quote.discountCents,
    studentPaysCents: quote.studentPaysCents,
    codeApplied: quote.codeApplied,
  };
}

let shared: MockApi | null = null;
export function sharedMockApi(): MockApi {
  shared ??= createMockApi();
  return shared;
}
