import { afterAll, describe, expect, it, vi } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import { hashToken } from "@/lib/api-token";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";

const stripeState = vi.hoisted(() => ({
  intents: new Map<string, string>(),
  cancelled: [] as string[],
}));

vi.mock("@/lib/stripe", () => ({
  stripeConfigured: () => false,
  getStripe: () => ({
    paymentIntents: {
      retrieve: async (id: string) => ({ id, status: stripeState.intents.get(id) ?? "requires_payment_method" }),
      cancel: async (id: string) => {
        const current = stripeState.intents.get(id) ?? "requires_payment_method";
        if (current === "succeeded" || current === "processing") {
          const error = new Error("cannot cancel") as Error & { code: string };
          error.code = "payment_intent_unexpected_state";
          throw error;
        }
        stripeState.cancelled.push(id);
        stripeState.intents.set(id, "canceled");
        return { id, status: "canceled" };
      },
    },
    checkout: {
      sessions: {
        retrieve: async (id: string) => ({ id, status: "open", payment_status: "unpaid" }),
        expire: async (id: string) => ({ id, status: "expired" }),
      },
    },
  }),
  createCheckout: vi.fn(),
  createPaymentIntent: vi.fn(),
}));

vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(async () => ({ id: "email" })),
  sendIndividually: vi.fn(async () => ({ id: "batch" })),
}));

const { releaseExpiredCheckoutHolds, rescheduleBooking, fulfillPaidCheckout, purchaseOffer } = await import("@/lib/booking-service");
const { capture } = await import("@/lib/analytics");
const { handleMobileApi } = await import("@/lib/mobile-api");
const { studentFunnel } = await import("@/lib/analytics-report");

const tag = `pr7-${crypto.randomUUID().slice(0, 8)}`;
const userIds: string[] = [];
const teacherIds: string[] = [];
const categoryIds: string[] = [];
const orderIds: string[] = [];
const faqIds: string[] = [];

async function person(name: string) {
  const id = crypto.randomUUID();
  userIds.push(id);
  await db.insert(schema.user).values({ id, name, email: `${tag}-${name}@example.com`, emailVerified: true });
  return id;
}

async function tokenFor(userId: string) {
  const raw = `bc_${crypto.randomUUID().replace(/-/g, "")}`;
  await db.insert(schema.apiTokens).values({
    id: crypto.randomUUID(),
    userId,
    tokenHash: hashToken(raw),
    expiresAt: new Date(Date.now() + 86_400_000),
  });
  return raw;
}

describe("PR 7 bugbot regressions", () => {
  afterAll(async () => {
    if (orderIds.length) await db.delete(schema.orders).where(inArray(schema.orders.id, orderIds));
    if (teacherIds.length) await db.delete(schema.teachers).where(inArray(schema.teachers.id, teacherIds));
    if (faqIds.length) await db.delete(schema.faqArticles).where(inArray(schema.faqArticles.id, faqIds));
    if (userIds.length) await db.delete(schema.user).where(inArray(schema.user.id, userIds));
    if (categoryIds.length) await db.delete(schema.categories).where(inArray(schema.categories.id, categoryIds));
    await db.delete(schema.analyticsEvents).where(sql`${schema.analyticsEvents.anonymousId} like ${`${tag}%`} or ${schema.analyticsEvents.properties}->>'q' like ${`%${tag}%`} or ${schema.analyticsEvents.properties}->>'slug' like ${`${tag}%`}`);
    await db.delete(schema.rateBuckets).where(sql`${schema.rateBuckets.key} like ${`%${tag}%`}`);
  });

  it("cancels an open PaymentIntent before expiring the checkout hold", async () => {
    const categoryId = crypto.randomUUID();
    categoryIds.push(categoryId);
    await db.insert(schema.categories).values({ id: categoryId, name: "Acting", slug: `${tag}-acting` });
    const owner = await person("owner");
    const student = await person("sheet-student");
    const teacherId = crypto.randomUUID();
    teacherIds.push(teacherId);
    await db.insert(schema.teachers).values({ id: teacherId, userId: owner, slug: `${tag}-studio`, studioName: `${tag} studio`, status: "approved", bio: "A studio bio long enough.", stripeChargesEnabled: true });
    const classId = crypto.randomUUID();
    await db.insert(schema.classes).values({
      id: classId,
      teacherId,
      categoryId,
      slug: `${tag}-class`,
      title: "Scene study",
      skillLevel: "all",
      format: "class",
      delivery: "virtual",
      maxSize: 8,
      durationMinutes: 60,
      pricePerSessionCents: 2500,
      status: "published",
    });
    const intentId = `pi_${tag}_open`;
    stripeState.intents.set(intentId, "requires_payment_method");
    const orderId = crypto.randomUUID();
    orderIds.push(orderId);
    const createdAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await db.insert(schema.orders).values({
      id: orderId,
      userId: student,
      teacherId,
      kind: "booking",
      status: "pending",
      stripePaymentIntentId: intentId,
      createdAt,
    });
    const bookingId = crypto.randomUUID();
    await db.insert(schema.bookings).values({ id: bookingId, orderId, userId: student, classId, kind: "session", status: "confirmed" });
    await releaseExpiredCheckoutHolds(new Date());
    expect(stripeState.cancelled).toContain(intentId);
    const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
    expect(order?.status).toBe("expired");
    const [booking] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, bookingId));
    expect(booking?.status).toBe("cancelled");
    await fulfillPaidCheckout(orderId, intentId, null);
    const [after] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
    expect(after?.status).toBe("expired");
  });

  it("keeps the seat when the PaymentIntent has already succeeded", async () => {
    const owner = await person("paid-owner");
    const student = await person("paid-student");
    const teacherId = crypto.randomUUID();
    teacherIds.push(teacherId);
    const categoryId = categoryIds[0]!;
    await db.insert(schema.teachers).values({ id: teacherId, userId: owner, slug: `${tag}-paid-studio`, studioName: "Paid", status: "approved", bio: "" });
    const classId = crypto.randomUUID();
    await db.insert(schema.classes).values({
      id: classId,
      teacherId,
      categoryId,
      slug: `${tag}-paid-class`,
      title: "Paid",
      skillLevel: "all",
      format: "class",
      delivery: "virtual",
      maxSize: 4,
      durationMinutes: 60,
      status: "published",
    });
    const intentId = `pi_${tag}_paid`;
    stripeState.intents.set(intentId, "succeeded");
    const orderId = crypto.randomUUID();
    orderIds.push(orderId);
    await db.insert(schema.orders).values({
      id: orderId,
      userId: student,
      teacherId,
      kind: "booking",
      status: "pending",
      stripePaymentIntentId: intentId,
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    });
    const bookingId = crypto.randomUUID();
    await db.insert(schema.bookings).values({ id: bookingId, orderId, userId: student, classId, kind: "session", status: "confirmed" });
    await releaseExpiredCheckoutHolds(new Date());
    expect(stripeState.cancelled).not.toContain(intentId);
    const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
    expect(order?.status).toBe("pending");
    const [booking] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, bookingId));
    expect(booking?.status).toBe("confirmed");
  });

  it("returns upcoming slots from GET /classes/slots", async () => {
    const student = await person("slots-student");
    const token = await tokenFor(student);
    const [klass] = await db.select().from(schema.classes).where(eq(schema.classes.slug, `${tag}-class`));
    const sessionId = crypto.randomUUID();
    await db.insert(schema.sessions).values({
      id: sessionId,
      classId: klass!.id,
      startsAt: new Date("2027-06-01T18:00:00Z"),
      endsAt: new Date("2027-06-01T19:00:00Z"),
      localDate: "2027-06-01",
      capacity: 8,
    });
    const authed = await handleMobileApi(new Request(`http://localhost/api/v1/classes/slots?slug=${tag}-class`, { headers: { authorization: `Bearer ${token}` } }), ["classes", "slots"]);
    expect(authed.status).toBe(200);
    const body = await authed.json() as { slots: { id: string }[] };
    expect(body.slots.map((slot) => slot.id)).toContain(sessionId);
    const anon = await handleMobileApi(new Request(`http://localhost/api/v1/classes/slots?slug=${tag}-class`), ["classes", "slots"]);
    expect(anon.status).toBe(401);
  });

  it("rejects client money events and still accepts page views", async () => {
    const denied = await handleMobileApi(new Request("http://localhost/api/v1/track", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": `${tag}-money` },
      body: JSON.stringify({ name: "checkout_completed", anonymousId: `${tag}-money` }),
    }), ["track"]);
    expect(denied.status).toBe(400);
    const stored = await db.select().from(schema.analyticsEvents).where(eq(schema.analyticsEvents.anonymousId, `${tag}-money`));
    expect(stored).toHaveLength(0);
    const allowed = await handleMobileApi(new Request("http://localhost/api/v1/track", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": `${tag}-page` },
      body: JSON.stringify({ name: "page_view", anonymousId: `${tag}-page` }),
    }), ["track"]);
    expect(allowed.status).toBe(200);
  });

  it("stores the analytics row when PostHog is unreachable", async () => {
    const previous = process.env.POSTHOG_KEY;
    process.env.POSTHOG_KEY = "ph_test";
    const fetchMock = vi.fn(async () => {
      throw new Error("network down");
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      const result = await capture({ name: "page_view", anonymousId: `${tag}-ph`, consent: true, demo: true });
      expect(result.ok).toBe(true);
      expect(fetchMock).toHaveBeenCalled();
      const [row] = await db.select().from(schema.analyticsEvents).where(eq(schema.analyticsEvents.anonymousId, `${tag}-ph`));
      expect(row?.name).toBe("page_view");
    } finally {
      if (previous === undefined) delete process.env.POSTHOG_KEY;
      else process.env.POSTHOG_KEY = previous;
      vi.unstubAllGlobals();
    }
  });

  it("hides unpublished help articles from the student API", async () => {
    const publishedId = crypto.randomUUID();
    const draftId = crypto.randomUUID();
    faqIds.push(publishedId, draftId);
    await db.insert(schema.faqArticles).values([
      { id: publishedId, slug: `${tag}-published`, title: "Published", body: "Visible", category: "booking", published: true },
      { id: draftId, slug: `${tag}-draft`, title: "Draft", body: "Secret", category: "booking", published: false },
    ]);
    const list = await handleMobileApi(new Request("http://localhost/api/v1/help"), ["help"]);
    expect(list.status).toBe(200);
    const body = await list.json() as { articles: { slug: string }[] };
    const slugs = body.articles.map((article) => article.slug);
    expect(slugs).toContain(`${tag}-published`);
    expect(slugs).not.toContain(`${tag}-draft`);
    const draft = await handleMobileApi(new Request(`http://localhost/api/v1/help/${tag}-draft`), ["help", `${tag}-draft`]);
    expect(draft.status).toBe(404);
    const article = await handleMobileApi(new Request(`http://localhost/api/v1/help/${tag}-published`), ["help", `${tag}-published`]);
    expect(article.status).toBe(200);
  });

  it("lets only one reschedule take the last seat", async () => {
    const categoryId = categoryIds[0]!;
    const owner = await person("move-owner");
    const firstStudent = await person("move-a");
    const secondStudent = await person("move-b");
    const teacherId = crypto.randomUUID();
    teacherIds.push(teacherId);
    await db.insert(schema.teachers).values({ id: teacherId, userId: owner, slug: `${tag}-move`, studioName: "Move", status: "approved", bio: "" });
    const classId = crypto.randomUUID();
    await db.insert(schema.classes).values({
      id: classId,
      teacherId,
      categoryId,
      slug: `${tag}-move-class`,
      title: "Move",
      skillLevel: "all",
      format: "class",
      delivery: "virtual",
      maxSize: 1,
      durationMinutes: 60,
      status: "published",
    });
    async function session(day: string, capacity: number) {
      const id = crypto.randomUUID();
      await db.insert(schema.sessions).values({
        id,
        classId,
        startsAt: new Date(`${day}T18:00:00Z`),
        endsAt: new Date(`${day}T19:00:00Z`),
        localDate: day,
        capacity,
      });
      return id;
    }
    const sourceA = await session("2027-07-01", 4);
    const sourceB = await session("2027-07-02", 4);
    const target = await session("2027-07-03", 1);
    async function booking(userId: string, sessionId: string) {
      const id = crypto.randomUUID();
      await db.insert(schema.bookings).values({ id, userId, classId, kind: "session", status: "confirmed" });
      await db.insert(schema.bookingSessions).values({ id: crypto.randomUUID(), bookingId: id, sessionId });
      return id;
    }
    const bookingA = await booking(firstStudent, sourceA);
    const bookingB = await booking(secondStudent, sourceB);
    const [movedA, movedB] = await Promise.all([
      rescheduleBooking(firstStudent, bookingA, target),
      rescheduleBooking(secondStudent, bookingB, target),
    ]);
    const results = [movedA, movedB];
    expect(results.filter((result) => "ok" in result && result.ok)).toHaveLength(1);
    expect(results.filter((result) => "error" in result)).toEqual([{ error: "That date is full." }]);
    const seated = await db.select().from(schema.bookingSessions).where(eq(schema.bookingSessions.sessionId, target));
    expect(seated).toHaveLength(1);
  });

  it("refuses to move a past or checked-in date", async () => {
    const categoryId = categoryIds[0] ?? crypto.randomUUID();
    if (!categoryIds.length) {
      categoryIds.push(categoryId);
      await db.insert(schema.categories).values({ id: categoryId, name: "Move", slug: `${tag}-used-cat` });
    }
    const owner = await person("used-owner");
    const student = await person("used-student");
    const teacherId = crypto.randomUUID();
    teacherIds.push(teacherId);
    await db.insert(schema.teachers).values({ id: teacherId, userId: owner, slug: `${tag}-used`, studioName: "Used", status: "approved", bio: "" });
    const classId = crypto.randomUUID();
    await db.insert(schema.classes).values({
      id: classId,
      teacherId,
      categoryId,
      slug: `${tag}-used-class`,
      title: "Used",
      skillLevel: "all",
      format: "class",
      delivery: "virtual",
      maxSize: 8,
      durationMinutes: 60,
      status: "published",
    });
    async function session(day: string) {
      const id = crypto.randomUUID();
      await db.insert(schema.sessions).values({
        id,
        classId,
        startsAt: new Date(`${day}T18:00:00Z`),
        endsAt: new Date(`${day}T19:00:00Z`),
        localDate: day,
        capacity: 8,
      });
      return id;
    }
    async function booking(sessionId: string, checkedIn = false) {
      const id = crypto.randomUUID();
      await db.insert(schema.bookings).values({ id, userId: student, classId, kind: "session", status: "confirmed" });
      await db.insert(schema.bookingSessions).values({ id: crypto.randomUUID(), bookingId: id, sessionId, checkedIn });
      return id;
    }
    const past = await session("2020-01-02");
    const attended = await session("2027-08-01");
    const open = await session("2027-08-02");
    const destination = await session("2027-08-03");
    const pastBooking = await booking(past);
    const attendedBooking = await booking(attended, true);
    const openBooking = await booking(open);
    expect(await rescheduleBooking(student, pastBooking, destination)).toEqual({ error: "That date has already been used." });
    expect(await rescheduleBooking(student, attendedBooking, destination)).toEqual({ error: "That date has already been used." });
    expect(await rescheduleBooking(student, openBooking, destination)).toEqual({ ok: true });
    const stayed = await db.select().from(schema.bookingSessions).where(eq(schema.bookingSessions.bookingId, pastBooking));
    expect(stayed[0]?.sessionId).toBe(past);
    const moved = await db.select().from(schema.bookingSessions).where(eq(schema.bookingSessions.bookingId, openBooking));
    expect(moved[0]?.sessionId).toBe(destination);
  });

  it("records checkout events for free and studio-pay offers", async () => {
    const owner = await person("offer-money");
    const student = await person("offer-buyer");
    const teacherId = crypto.randomUUID();
    teacherIds.push(teacherId);
    await db.insert(schema.teachers).values({ id: teacherId, userId: owner, slug: `${tag}-offer-money`, studioName: "Offer", status: "approved", bio: "", stripeChargesEnabled: false });
    const freeId = crypto.randomUUID();
    const studioId = crypto.randomUUID();
    await db.insert(schema.packs).values([
      { id: freeId, teacherId, slug: `${tag}-free-pack`, name: "Free pack", creditCount: 2, priceCents: 0 },
      { id: studioId, teacherId, slug: `${tag}-studio-pack`, name: "Studio pack", creditCount: 4, priceCents: 4000 },
    ]);
    const free = await purchaseOffer({ userId: student, email: `${tag}-offer-buyer@example.com`, kind: "pack", id: freeId });
    const studio = await purchaseOffer({ userId: student, email: `${tag}-offer-buyer@example.com`, kind: "pack", id: studioId });
    expect(free).toMatchObject({ ok: true, studentPaysCents: 0 });
    expect(studio).toMatchObject({ ok: true, studentPaysCents: 4000 });
    const events = await db.select().from(schema.analyticsEvents).where(eq(schema.analyticsEvents.userId, student));
    const names = events.map((event) => `${event.name}:${event.properties.kind}`);
    expect(names.filter((name) => name === "checkout_completed:pack")).toHaveLength(2);
    expect(names.filter((name) => name === "offer_purchased:pack")).toHaveLength(2);
    const ordersForStudent = await db.select().from(schema.orders).where(eq(schema.orders.userId, student));
    expect(ordersForStudent.map((order) => order.status).sort()).toEqual(["paid", "pay_at_studio"]);
    orderIds.push(...ordersForStudent.map((order) => order.id));
  });

  it("counts attendance from this period's class payments only", async () => {
    const categoryId = categoryIds[0]!;
    const owner = await person("funnel-owner");
    const classStudent = await person("funnel-class");
    const packStudent = await person("funnel-pack");
    const oldStudent = await person("funnel-old");
    const teacherId = crypto.randomUUID();
    teacherIds.push(teacherId);
    await db.insert(schema.teachers).values({ id: teacherId, userId: owner, slug: `${tag}-funnel`, studioName: "Funnel", status: "approved", bio: "" });
    const classId = crypto.randomUUID();
    await db.insert(schema.classes).values({
      id: classId,
      teacherId,
      categoryId,
      slug: `${tag}-funnel-class`,
      title: "Funnel",
      skillLevel: "all",
      format: "class",
      delivery: "virtual",
      maxSize: 8,
      durationMinutes: 60,
      status: "published",
    });
    const sessionId = crypto.randomUUID();
    await db.insert(schema.sessions).values({
      id: sessionId,
      classId,
      startsAt: new Date("2031-05-01T18:00:00Z"),
      endsAt: new Date("2031-05-01T19:00:00Z"),
      localDate: "2031-05-01",
      capacity: 8,
    });
    const paidAt = new Date("2031-04-10T15:00:00Z");
    const rebookAt = new Date("2031-04-20T15:00:00Z");
    const oldAt = new Date("2030-01-02T15:00:00Z");
    const oldFollowAt = new Date("2030-01-12T15:00:00Z");
    async function orderBooking(input: { userId: string; kind: string; at: Date; status?: string; checkedIn?: boolean }) {
      const orderId = crypto.randomUUID();
      orderIds.push(orderId);
      await db.insert(schema.orders).values({ id: orderId, userId: input.userId, teacherId, kind: input.kind, status: "paid", createdAt: input.at });
      if (input.kind === "pack") return orderId;
      const bookingId = crypto.randomUUID();
      await db.insert(schema.bookings).values({
        id: bookingId,
        orderId,
        userId: input.userId,
        classId,
        kind: "session",
        status: input.status ?? "confirmed",
        createdAt: input.at,
      });
      await db.insert(schema.bookingSessions).values({
        id: crypto.randomUUID(),
        bookingId,
        sessionId,
        checkedIn: Boolean(input.checkedIn),
        checkedInAt: input.checkedIn ? input.at : null,
      });
      return orderId;
    }
    const classOrder = await orderBooking({ userId: classStudent, kind: "booking", at: paidAt, checkedIn: true });
    const followId = crypto.randomUUID();
    await db.insert(schema.bookings).values({ id: followId, userId: classStudent, classId, kind: "session", status: "confirmed", createdAt: rebookAt });
    await db.insert(schema.bookingSessions).values({ id: crypto.randomUUID(), bookingId: followId, sessionId });
    const packOrder = await orderBooking({ userId: packStudent, kind: "pack", at: paidAt });
    await orderBooking({ userId: packStudent, kind: "booking", at: oldAt, checkedIn: true });
    const oldFollow = crypto.randomUUID();
    await db.insert(schema.bookings).values({ id: oldFollow, userId: packStudent, classId, kind: "session", status: "confirmed", createdAt: oldFollowAt });
    await db.insert(schema.bookingSessions).values({ id: crypto.randomUUID(), bookingId: oldFollow, sessionId });
    const oldOrder = await orderBooking({ userId: oldStudent, kind: "booking", at: paidAt, checkedIn: false });
    await orderBooking({ userId: oldStudent, kind: "booking", at: oldAt, checkedIn: true });
    const cancelledOrder = await orderBooking({ userId: oldStudent, kind: "booking", at: paidAt, status: "cancelled", checkedIn: true });
    await db.insert(schema.analyticsEvents).values([
      { id: crypto.randomUUID(), name: "checkout_completed", userId: classStudent, anonymousId: `${tag}-class`, platform: "web", properties: { orderId: classOrder, kind: "booking" }, createdAt: paidAt },
      { id: crypto.randomUUID(), name: "checkout_completed", userId: packStudent, anonymousId: `${tag}-pack`, platform: "web", properties: { orderId: packOrder, kind: "pack" }, createdAt: paidAt },
      { id: crypto.randomUUID(), name: "checkout_completed", userId: oldStudent, anonymousId: `${tag}-old`, platform: "web", properties: { orderId: oldOrder, kind: "booking" }, createdAt: paidAt },
      { id: crypto.randomUUID(), name: "checkout_completed", userId: oldStudent, anonymousId: `${tag}-cancelled`, platform: "web", properties: { orderId: cancelledOrder, kind: "booking" }, createdAt: paidAt },
    ]);
    const funnel = await studentFunnel({ from: new Date("2031-04-01T00:00:00Z"), to: new Date("2031-04-30T23:59:59Z") });
    const attended = funnel.find((step) => step.name === "Attended");
    const rebooked = funnel.find((step) => step.name === "Rebooked in 30 days");
    expect(attended?.count).toBe(1);
    expect(rebooked?.count).toBe(1);
  });

  it("filters wellness services with the same query as explore", async () => {
    const yogaId = crypto.randomUUID();
    const massageId = crypto.randomUUID();
    categoryIds.push(yogaId, massageId);
    await db.insert(schema.categories).values([
      { id: yogaId, name: `${tag}-yoga`, slug: `${tag}-yoga`, vertical: "wellness" },
      { id: massageId, name: `${tag}-massage`, slug: `${tag}-massage`, vertical: "wellness" },
    ]);
    const alphaOwner = await person("alpha-owner");
    const betaOwner = await person("beta-owner");
    const alpha = crypto.randomUUID();
    const beta = crypto.randomUUID();
    teacherIds.push(alpha, beta);
    await db.insert(schema.teachers).values([
      { id: alpha, userId: alphaOwner, slug: `${tag}-alpha`, studioName: `${tag}-alpha studio`, status: "approved", bio: "" },
      { id: beta, userId: betaOwner, slug: `${tag}-beta`, studioName: `${tag}-beta studio`, status: "approved", bio: "" },
    ]);
    await db.insert(schema.services).values([
      { id: crypto.randomUUID(), teacherId: alpha, categoryId: yogaId, slug: `${tag}-flow`, title: "Morning flow", kind: "appointment", status: "published" },
      { id: crypto.randomUUID(), teacherId: beta, categoryId: massageId, slug: `${tag}-rub`, title: "Night stretch", kind: "appointment", status: "published" },
    ]);
    const byStudio = await handleMobileApi(new Request(`http://localhost/api/v1/search?q=${encodeURIComponent(`${tag}-alpha`)}`, { headers: { "x-forwarded-for": `${tag}-search` } }), ["search"]);
    const studioBody = await byStudio.json() as { services: { slug: string }[] };
    expect(studioBody.services.map((row) => row.slug)).toContain(`${tag}-flow`);
    expect(studioBody.services.map((row) => row.slug)).not.toContain(`${tag}-rub`);
    const byCategory = await handleMobileApi(new Request(`http://localhost/api/v1/search?q=${encodeURIComponent(`${tag}-massage`)}`), ["search"]);
    const categoryBody = await byCategory.json() as { services: { slug: string }[] };
    expect(categoryBody.services.map((row) => row.slug)).toContain(`${tag}-rub`);
    expect(categoryBody.services.map((row) => row.slug)).not.toContain(`${tag}-flow`);
  });

  it("gives a device token to the account that just registered it", async () => {
    const first = await person("push-a");
    const second = await person("push-b");
    const firstToken = await tokenFor(first);
    const secondToken = await tokenFor(second);
    const device = `${tag}-expo-token`;
    const register = (bearer: string) => handleMobileApi(new Request("http://localhost/api/v1/push-tokens", {
      method: "POST",
      headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json", "x-forwarded-for": `${tag}-push` },
      body: JSON.stringify({ token: device, platform: "ios", provider: "expo" }),
    }), ["push-tokens"]);
    expect((await register(firstToken)).status).toBe(200);
    expect((await register(secondToken)).status).toBe(200);
    const rows = await db.select().from(schema.deviceTokens).where(eq(schema.deviceTokens.token, device));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.userId).toBe(second);
  });
});
