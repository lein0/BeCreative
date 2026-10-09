import { validatePromo, type ProductScope } from "../../../lib/pricing";
import {
  canReschedule,
  cancelDecision,
  entitlementCovers,
  helpActions,
  needsPaymentSheet,
  normalizePromoInput,
  priceBooking,
  rescheduleTargetSession,
  rescheduleTargetSlot,
  selectionListPrice,
  waiverReady,
  type SessionChoice,
} from "../booking/flow";
import {
  DEMO_EMAIL,
  DEMO_PASSWORD,
  DEMO_TOKEN,
  DEMO_USER_ID,
  VERIFY_CODE,
  buildFixtures,
  teacherProfile,
  toCard,
  type FixtureWorld,
} from "./fixtures";
import {
  ApiError,
  type AuthSession,
  type BookingRecord,
  type ClassDetail,
  type ClassSession,
  type CreateBookingRequest,
  type ExploreQuery,
  type OrderRecord,
  type QuoteRequest,
  type StudentApi,
  type StudentUser,
  type TrackEvent,
} from "./types";

type UserRecord = StudentUser & { password: string; verifiedCode: string | null; resetToken: string | null };

function cloneWorld(now?: Date): { world: FixtureWorld; users: UserRecord[] } {
  const world = buildFixtures(now);
  const users: UserRecord[] = [{ ...world.user, password: DEMO_PASSWORD, verifiedCode: null, resetToken: null }];
  return { world, users };
}

function paymentFor(orderId: string, userId: string) {
  return {
    paymentIntentClientSecret: `pi_mock_secret_${orderId}`,
    customerId: `cus_mock_${userId}`,
    customerEphemeralKeySecret: `ek_mock_${orderId}`,
    merchantDisplayName: "BeCreative",
    publishableKey: "pk_test_mock",
    merchantCountryCode: "US",
    applePayMerchantId: "merchant.com.becreative.students",
    googlePayTestEnv: true,
  };
}

function choice(session: ClassSession): SessionChoice {
  return {
    id: session.id,
    startsAt: new Date(session.startsAt),
    endsAt: new Date(session.endsAt),
    status: session.status,
    capacity: session.capacity,
    confirmedCount: session.confirmedCount,
  };
}

function milesBetween(aLat: number, aLng: number, bLat: number, bLng: number) {
  const rad = (value: number) => (value * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function ymd(iso: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

export type MockStudentApi = StudentApi & { recordedEvents: TrackEvent[] };

export function createMockApi(now = new Date(), getToken?: () => string | null): MockStudentApi {
  const state = cloneWorld(now);
  const orders = new Map<string, OrderRecord>();
  const tokens = new Map<string, string>([[DEMO_TOKEN, DEMO_USER_ID]]);
  const idempotency = new Map<string, BookingRecord["id"]>();
  const pushTokens: { token: string; userId: string; platform: "ios" | "android" }[] = [];
  const recordedEvents: TrackEvent[] = [];
  let sequence = 1;
  const nextId = (prefix: string) => `${prefix}-${sequence++}`;

  orders.set("order-cold", {
    id: "order-cold",
    bookingId: "book-cold",
    classTitle: "Cold Read Lab",
    kind: "session",
    status: "paid",
    listPriceCents: 2800,
    discountCents: 0,
    studentPaysCents: 2800,
    platformFeeCents: 280,
    teacherAmountCents: 2520,
    paymentPath: "cash",
    promoCode: null,
    payment: null,
    createdAt: new Date(now.getTime() - 86400000).toISOString(),
  });

  const api: MockStudentApi = {
    mode: "mock",
    recordedEvents,
    async catalog() {
      return state.world.catalog;
    },
    async explore(query: ExploreQuery = {}) {
      const q = query.q?.trim().toLowerCase() ?? "";
      const classes = state.world.classes.filter((detail) => {
        const card = toCard(detail);
        if (query.vertical && card.vertical !== query.vertical) return false;
        if (query.category && card.categorySlug !== query.category) return false;
        if (query.neighborhood && card.neighborhood !== query.neighborhood) return false;
        if (q && !`${card.title} ${card.teacherName} ${card.categoryName}`.toLowerCase().includes(q)) return false;
        const price = card.pricePerSessionCents ?? card.pricePerSeriesCents ?? 0;
        if (query.maxPriceCents != null && price > query.maxPriceCents) return false;
        const isFree = price === 0;
        if (query.free && query.firstClassFree) {
          if (!isFree && !card.firstClassFree) return false;
        } else if (query.free && !isFree) return false;
        else if (query.firstClassFree && !card.firstClassFree) return false;
        if (query.date) {
          const dates = [...detail.sessions.map((item) => item.localDate), ...detail.slots.map((item) => ymd(item.startsAt))];
          if (!dates.includes(query.date)) return false;
        }
        if (query.lat != null && query.lng != null && query.miles != null && card.lat != null && card.lng != null && card.delivery !== "virtual") {
          if (milesBetween(query.lat, query.lng, card.lat, card.lng) > query.miles) return false;
        }
        return true;
      });
      return { classes: classes.map(toCard), nextCursor: null };
    },
    async classDetail(slug: string) {
      const detail = classBySlug(slug);
      const user = optionalUser();
      return {
        ...detail,
        introAlreadyUsed: Boolean(user && state.world.introUsed.has(`${user.id}:${detail.teacher.id}`)),
      };
    },
    async teacher(slug: string) {
      const profile = teacherProfile(state.world, slug);
      if (!profile) throw new ApiError(404, "not_found", "That teacher is not on BeCreative.");
      return profile;
    },
    async quote(input: QuoteRequest) {
      return price(input);
    },
    async createBooking(input: CreateBookingRequest, idempotencyKey?: string) {
      const user = requireUser();
      if (idempotencyKey) {
        const existingId = idempotency.get(idempotencyKey);
        const existing = existingId ? state.world.bookings.find((item) => item.id === existingId) : undefined;
        if (existing) {
          const order = existing.orderId ? orders.get(existing.orderId) : undefined;
          if (order) return { booking: existing, order };
        }
      }
      const detail = classBySlug(input.classSlug);
      const signed = waiverReady({
        required: detail.waiver.required,
        agreed: input.waiver?.agreed ?? false,
        signedName: input.waiver?.signedName ?? "",
        accountName: user.name,
      });
      if (!signed.ok) throw new ApiError(422, "waiver_required", signed.reason);
      const priced = price(input);
      const orderId = nextId("order");
      const bookingId = nextId("book");
      const sheet = needsPaymentSheet(priced.quote) ? paymentFor(orderId, user.id) : null;
      const when = timing(detail, input);
      const booking: BookingRecord = {
        id: bookingId,
        classSlug: detail.slug,
        classTitle: detail.title,
        teacherName: detail.teacher.studioName || "Teacher",
        kind: input.kind,
        status: sheet ? "pending" : priced.label === "Waitlist" ? "waitlisted" : "confirmed",
        startsAt: when.startsAt,
        endsAt: when.endsAt,
        location: detail.location?.neighborhood ?? "Los Angeles",
        sessionId: input.sessionId ?? null,
        slotId: input.slotId ?? null,
        partySize: input.partySize ?? 1,
        orderId,
      };
      const order: OrderRecord = {
        id: orderId,
        bookingId,
        classTitle: detail.title,
        kind: input.kind,
        status: sheet ? "pending" : "paid",
        listPriceCents: priced.quote.listPriceCents,
        discountCents: priced.quote.discountCents,
        studentPaysCents: priced.quote.studentPaysCents,
        platformFeeCents: priced.quote.platformFeeCents,
        teacherAmountCents: priced.quote.teacherAmountCents,
        paymentPath: priced.quote.paymentPath,
        promoCode: priced.quote.codeApplied,
        payment: sheet,
        createdAt: new Date().toISOString(),
      };
      if (!sheet && input.usePackId) {
        const pack = state.world.packs.find((item) => item.id === input.usePackId);
        if (pack) pack.creditsRemaining -= 1;
      }
      if (!sheet && input.useMembershipId) {
        const plan = state.world.memberships.find((item) => item.id === input.useMembershipId);
        if (plan) plan.classesUsedThisPeriod += 1;
      }
      if (!sheet && priced.quote.paymentPath === "first_class_free") {
        state.world.introUsed.add(`${user.id}:${detail.teacher.id}`);
      }
      state.world.bookings.unshift(booking);
      orders.set(orderId, order);
      if (idempotencyKey) idempotency.set(idempotencyKey, bookingId);
      return { booking, order };
    },
    async confirmPayment(orderId: string, paymentIntentId: string) {
      requireUser();
      const order = orders.get(orderId);
      if (!order) throw new ApiError(404, "not_found", "That order is not on this account.");
      if (order.status === "paid") return order;
      if (!paymentIntentId) throw new ApiError(422, "validation", "Payment did not complete.");
      order.status = "paid";
      order.payment = null;
      const booking = state.world.bookings.find((item) => item.id === order.bookingId);
      if (booking && booking.status === "pending") booking.status = "confirmed";
      return order;
    },
    async getOrder(orderId: string) {
      requireUser();
      const order = orders.get(orderId);
      if (!order) throw new ApiError(404, "not_found", "That order is not on this account.");
      return order;
    },
    async cancelBooking(id: string) {
      const booking = requireBooking(id);
      const decision = cancelDecision({ now: new Date(), startsAt: new Date(booking.startsAt), status: booking.status, kind: booking.kind });
      if (!decision.allowed) throw new ApiError(409, "policy", decision.reason);
      booking.status = "cancelled";
      const order = booking.orderId ? orders.get(booking.orderId) : undefined;
      if (order && decision.refund !== "none") order.status = "cancelled";
      if (decision.refund === "credit") {
        state.world.ledger.unshift({
          id: nextId("led"),
          direction: "credit",
          sourceType: "cancel",
          label: `Credit for ${booking.classTitle}`,
          createdAt: new Date().toISOString(),
        });
      }
      return { booking, refund: decision.refund, message: decision.message };
    },
    async rescheduleBooking(id: string, target: { sessionId?: string; slotId?: string }) {
      const booking = requireBooking(id);
      const detail = classBySlug(booking.classSlug);
      const allowed = canReschedule({ now: new Date(), startsAt: new Date(booking.startsAt), status: booking.status, kind: booking.kind });
      if (!allowed.ok) throw new ApiError(409, "policy", allowed.reason);
      if (target.sessionId) {
        const session = detail.sessions.find((item) => item.id === target.sessionId);
        if (!session) throw new ApiError(404, "not_found", "That date is not on this class.");
        const check = rescheduleTargetSession({ now: new Date(), target: choice(session) });
        if (!check.ok) throw new ApiError(409, "policy", check.reason);
        booking.sessionId = session.id;
        booking.startsAt = session.startsAt;
        booking.endsAt = session.endsAt;
        return booking;
      }
      if (target.slotId) {
        const slot = detail.slots.find((item) => item.id === target.slotId);
        if (!slot) throw new ApiError(404, "not_found", "That time is not open.");
        const check = rescheduleTargetSlot({
          now: new Date(),
          slot: { ...slot, startsAt: new Date(slot.startsAt), endsAt: new Date(slot.endsAt) },
          partySize: booking.partySize,
        });
        if (!check.ok) throw new ApiError(409, "policy", check.reason);
        booking.slotId = slot.id;
        booking.startsAt = slot.startsAt;
        booking.endsAt = slot.endsAt;
        return booking;
      }
      throw new ApiError(422, "validation", "Choose a new time.");
    },
    async bookings() {
      requireUser();
      return { bookings: state.world.bookings };
    },
    async booking(id: string) {
      return requireBooking(id);
    },
    async wallet() {
      requireUser();
      return { packs: state.world.packs, memberships: state.world.memberships, ledger: state.world.ledger };
    },
    async signup(input) {
      const email = input.email.trim().toLowerCase();
      if (!email.includes("@") || input.password.length < 8 || input.name.trim().length < 2) {
        throw new ApiError(422, "validation", "Use your name, a real email, and a password of at least 8 characters.");
      }
      if (state.users.some((user) => user.email === email)) throw new ApiError(409, "conflict", "An account with that email already exists.");
      const user: UserRecord = {
        id: nextId("user"),
        name: input.name.trim(),
        email,
        emailVerified: false,
        phone: null,
        smsOptIn: false,
        imageUrl: null,
        password: input.password,
        verifiedCode: VERIFY_CODE,
        resetToken: null,
      };
      state.users.push(user);
      return { verificationRequired: true, user: publicUser(user) };
    },
    async login(input) {
      const user = state.users.find((item) => item.email === input.email.trim().toLowerCase());
      if (!user || user.password !== input.password) throw new ApiError(401, "unauthorized", "Email or password is wrong.");
      if (!user.emailVerified) throw new ApiError(403, "unverified", "Verify your email before you sign in.");
      return sessionFor(user);
    },
    async loginWithGoogle(input) {
      if (!input.idToken) throw new ApiError(422, "validation", "Google did not return a token.");
      const user = state.users.find((item) => item.id === DEMO_USER_ID)!;
      return sessionFor(user);
    },
    async loginWithApple(input) {
      if (!input.idToken) throw new ApiError(422, "validation", "Apple did not return a token.");
      const user = state.users.find((item) => item.id === DEMO_USER_ID)!;
      return sessionFor(user);
    },
    async verifyEmail(input) {
      const email = input.email?.trim().toLowerCase();
      const match = state.users.find((item) => (email && item.email === email) || (input.token && input.token === `verify:${item.email}`));
      if (!match) throw new ApiError(400, "validation", "That verification code is not valid.");
      if (!input.code && !input.token) throw new ApiError(422, "validation", "Enter the code from your email.");
      if (input.code && input.code !== (match.verifiedCode ?? VERIFY_CODE)) {
        throw new ApiError(400, "validation", "That verification code is not valid.");
      }
      match.emailVerified = true;
      match.verifiedCode = null;
      return sessionFor(match);
    },
    async resendVerification() {
      return { sent: true };
    },
    async forgotPassword(email) {
      const user = state.users.find((item) => item.email === email.trim().toLowerCase());
      if (user) user.resetToken = user.email === DEMO_EMAIL ? "reset-demo" : `reset-${user.email}`;
      return { sent: true };
    },
    async resetPassword(input) {
      const user = state.users.find((item) => item.resetToken === input.token);
      if (!user || input.password.length < 8) throw new ApiError(400, "validation", "That reset link is not valid.");
      user.password = input.password;
      user.resetToken = null;
      return { reset: true };
    },
    async logout() {
      return { ok: true as const };
    },
    async me() {
      return publicUser(requireUser());
    },
    async updateMe(patch) {
      const user = requireUser();
      if (patch.name != null) user.name = patch.name.trim();
      if (patch.phone !== undefined) user.phone = patch.phone;
      if (patch.smsOptIn != null) {
        if (patch.smsOptIn && !user.phone) throw new ApiError(422, "validation", "Add a mobile number before opting into texts.");
        user.smsOptIn = patch.smsOptIn;
        state.world.preferences.smsOptIn = patch.smsOptIn;
      }
      return publicUser(user);
    },
    async deleteMe(confirm) {
      const user = requireUser();
      if (confirm !== "DELETE") throw new ApiError(422, "validation", "Type DELETE to confirm.");
      state.users = state.users.filter((item) => item.id !== user.id);
      for (const [token, userId] of tokens) if (userId === user.id) tokens.delete(token);
      return { deleted: true as const };
    },
    async registerPushToken(input) {
      const user = requireUser();
      if (!input.expoPushToken.startsWith("ExponentPushToken")) throw new ApiError(422, "validation", "That is not an Expo push token.");
      pushTokens.push({ token: input.expoPushToken, userId: user.id, platform: input.platform });
      return { registered: true as const };
    },
    async unregisterPushToken(token) {
      const index = pushTokens.findIndex((item) => item.token === token);
      if (index >= 0) pushTokens.splice(index, 1);
      return { removed: true as const };
    },
    async notifications() {
      requireUser();
      return { items: state.world.notifications };
    },
    async markNotificationRead(id: string) {
      const note = state.world.notifications.find((item) => item.id === id);
      if (!note) throw new ApiError(404, "not_found", "That notification is gone.");
      note.read = true;
      return note;
    },
    async notificationPreferences() {
      requireUser();
      return state.world.preferences;
    },
    async updateNotificationPreferences(patch) {
      requireUser();
      state.world.preferences = { ...state.world.preferences, ...patch };
      return state.world.preferences;
    },
    async faq() {
      return {
        items: [
          { id: "faq-book", question: "How do I book?", answer: "Pick a date, a series, or a time slot. Add a promo if you have one, sign the waiver, then pay with Apple Pay, Google Pay, or a card." },
          { id: "faq-cancel", question: "Can I cancel?", answer: "More than 24 hours ahead is a full refund. Between 2 and 24 hours becomes account credit. Inside 2 hours the seat is released with no refund. A series cancel is not prorated." },
          { id: "faq-iap", question: "Why isn't this an in-app purchase?", answer: "You are paying an independent teacher for a real-world class or wellness session. Those charges use Stripe, not Apple in-app purchase." },
          { id: "faq-bewell", question: "What is BeWell?", answer: "BeWell is the wellness side of BeCreative: yoga, sound baths, massage, meditation, sauna, cold plunge, and stretching." },
        ],
      };
    },
    async helpActions(bookingId: string) {
      const booking = requireBooking(bookingId);
      return { actions: helpActions({ now: new Date(), startsAt: new Date(booking.startsAt), status: booking.status, kind: booking.kind }) };
    },
    async tickets() {
      requireUser();
      return { tickets: state.world.tickets };
    },
    async createTicket(input) {
      const user = requireUser();
      if (input.subject.trim().length < 3 || input.body.trim().length < 3) throw new ApiError(422, "validation", "Add a subject and a short note.");
      const ticket = {
        id: nextId("ticket"),
        bookingId: input.bookingId ?? null,
        subject: input.subject.trim(),
        body: input.body.trim(),
        status: "open" as const,
        createdAt: new Date().toISOString(),
      };
      state.world.tickets.unshift(ticket);
      void user;
      return ticket;
    },
    async track(event: TrackEvent) {
      if (!event.event || (event.platform !== "ios" && event.platform !== "android")) {
        throw new ApiError(422, "validation", "Track events need a name and platform ios or android.");
      }
      recordedEvents.push(event);
      return { accepted: true as const };
    },
    async experiments() {
      return { assignments: [{ key: "explore_density", variant: "comfortable" }] };
    },
  };

  function classBySlug(slug: string): ClassDetail {
    const detail = state.world.classes.find((item) => item.slug === slug);
    if (!detail) throw new ApiError(404, "not_found", "That class is not on BeCreative.");
    return detail;
  }

  function optionalUser(): UserRecord | null {
    if (!getToken) return state.users.find((item) => item.id === DEMO_USER_ID) ?? null;
    const token = getToken();
    if (!token) return null;
    const userId = tokens.get(token);
    return state.users.find((item) => item.id === userId) ?? null;
  }

  function requireUser(): UserRecord {
    const user = optionalUser();
    if (!user) throw new ApiError(401, "unauthorized", "Sign in to continue.");
    return user;
  }

  function requireBooking(id: string): BookingRecord {
    requireUser();
    const booking = state.world.bookings.find((item) => item.id === id);
    if (!booking) throw new ApiError(404, "not_found", "That booking is not on this account.");
    return booking;
  }

  function publicUser(user: UserRecord): StudentUser {
    const { password: _password, verifiedCode: _code, resetToken: _reset, ...rest } = user;
    return rest;
  }

  function sessionFor(user: UserRecord): AuthSession {
    const token = user.id === DEMO_USER_ID ? DEMO_TOKEN : `mock:${user.id}`;
    tokens.set(token, user.id);
    return { token, expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(), user: publicUser(user) };
  }

  function price(input: QuoteRequest) {
    const detail = classBySlug(input.classSlug);
    const user = optionalUser();
    const session = detail.sessions.find((item) => item.id === input.sessionId) ?? detail.sessions[0];
    const slot = detail.slots.find((item) => item.id === input.slotId) ?? (input.kind === "appointment" || input.kind === "capacity" ? detail.slots[0] : undefined);
    const addons = detail.addons.filter((item) => (input.addonIds ?? []).includes(item.id));
    const selected = selectionListPrice({
      kind: input.kind,
      now: new Date(),
      sessionPriceCents: detail.pricePerSessionCents ?? 0,
      seriesPriceCents: detail.pricePerSeriesCents,
      session: session ? choice(session) : null,
      seriesSessions: detail.sessions.map(choice),
      slot: slot ? { ...slot, startsAt: new Date(slot.startsAt), endsAt: new Date(slot.endsAt) } : null,
      addons,
      partySize: input.partySize,
      alreadyBooked: Boolean(session && state.world.bookings.some((item) => item.sessionId === session.id && item.status === "confirmed")),
      waitlistEnabled: false,
    });
    if (!selected.ok) throw new ApiError(409, "conflict", selected.reason);
    const codes = input.promoCode ? [input.promoCode] : [];
    const normalized = codes.length ? normalizePromoInput(codes) : { code: null, error: null };
    const promo = normalized.code ? state.world.promos.find((item) => item.code === normalized.code) ?? null : null;
    let promoError = normalized.error;
    if (normalized.code && !promo) promoError = "That code isn't valid.";
    if (promo) {
      const category = state.world.catalog.categories.find((item) => item.slug === detail.categorySlug);
      const product: ProductScope = {
        kind: "class",
        teacherId: detail.teacher.id,
        classId: detail.id,
        categoryId: category?.id,
        city: detail.location?.city,
      };
      const check = validatePromo({
        promo,
        now: new Date(),
        listPriceCents: selected.cents,
        totalRedemptions: 0,
        customerRedemptions: 0,
        isFirstTimeStudent: false,
        product,
      });
      if (!check.ok) promoError = check.reason;
    }
    const pack = input.usePackId ? state.world.packs.find((item) => item.id === input.usePackId) : undefined;
    const membership = input.useMembershipId ? state.world.memberships.find((item) => item.id === input.useMembershipId) : undefined;
    let entitlement = false;
    if (pack || membership) {
      const category = state.world.catalog.categories.find((item) => item.slug === detail.categorySlug);
      const covered = entitlementCovers({
        classId: detail.id,
        categoryId: category?.id ?? "",
        now: new Date(),
        kind: input.kind,
        pack: pack
          ? {
              type: "pack",
              creditsRemaining: pack.creditsRemaining,
              expiresAt: pack.expiresAt ? new Date(pack.expiresAt) : null,
              classIds: pack.classSlugs.map((slug) => `class-${slug}`),
              categoryIds: pack.categorySlugs.map((slug) => state.world.catalog.categories.find((item) => item.slug === slug)?.id ?? slug),
            }
          : undefined,
        membership: membership
          ? {
              type: "membership",
              status: membership.status,
              periodEnd: new Date(membership.currentPeriodEnd),
              unlimited: membership.unlimited,
              classesPerPeriod: membership.classesPerPeriod,
              classesUsed: membership.classesUsedThisPeriod,
              classIds: membership.classSlugs.map((slug) => `class-${slug}`),
              categoryIds: membership.categorySlugs.map((slug) => state.world.catalog.categories.find((item) => item.slug === slug)?.id ?? slug),
            }
          : undefined,
      });
      if (!covered.ok) throw new ApiError(409, "conflict", covered.reason);
      entitlement = true;
      if (normalized.code) promoError = "Codes don't apply when you pay with a credit.";
    }
    const quote = priceBooking({
      listPriceCents: selected.cents,
      feePercent: state.world.catalog.feePercent,
      feeFixedCents: state.world.catalog.feeFixedCents,
      promo: promoError ? null : promo,
      promoError,
      kind: input.kind,
      firstClassFreeEnabled: detail.firstClassFree,
      introAlreadyUsed: state.world.introUsed.has(`${user?.id ?? ""}:${detail.teacher.id}`),
      entitlement,
    });
    return { quote, listPriceCents: selected.cents, label: selected.label };
  }

  function timing(detail: ClassDetail, input: QuoteRequest) {
    const session = detail.sessions.find((item) => item.id === input.sessionId) ?? detail.sessions[0];
    const slot = detail.slots.find((item) => item.id === input.slotId) ?? detail.slots[0];
    if (input.kind === "series" && detail.sessions.length) {
      const last = detail.sessions[detail.sessions.length - 1];
      return { startsAt: detail.sessions[0].startsAt, endsAt: last.endsAt };
    }
    if (slot && (input.kind === "appointment" || input.kind === "capacity")) return { startsAt: slot.startsAt, endsAt: slot.endsAt };
    if (session) return { startsAt: session.startsAt, endsAt: session.endsAt };
    return { startsAt: new Date().toISOString(), endsAt: new Date().toISOString() };
  }

  return api;
}

let shared: MockStudentApi | null = null;
let tokenReader: () => string | null = () => null;

export function bindMockToken(reader: () => string | null) {
  tokenReader = reader;
}

export function sharedMockApi(): MockStudentApi {
  if (!shared) shared = createMockApi(new Date(), () => tokenReader());
  return shared;
}
