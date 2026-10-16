import { afterAll, describe, expect, it, vi } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";

vi.mock("@/lib/stripe", () => ({
  stripeConfigured: () => true,
  getStripe: () => null,
  createCheckout: vi.fn(async () => {
    throw new Error("stripe down");
  }),
  createPaymentIntent: vi.fn(async () => {
    throw new Error("stripe down");
  }),
}));

vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(async () => ({ id: "email" })),
  sendIndividually: vi.fn(async () => ({ id: "batch" })),
}));

vi.mock("@/lib/device-push", () => ({
  sendDevicePush: vi.fn(async () => {
    throw new Error("expo down");
  }),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => ({ get: () => null }),
}));

const { db } = await import("@/lib/db");
const schema = await import("@/lib/db/schema");
const { hashToken } = await import("@/lib/api-token");
const { purchaseOffer, rescheduleBooking, fulfillPaidCheckout } = await import("@/lib/booking-service");
const { dispatchStripeEvent } = await import("@/app/api/webhooks/stripe/route");
const { handleMobileApi } = await import("@/lib/mobile-api");
const { loadExperiment, assignExperiment } = await import("@/lib/experiments");
const { cohortRetention, experimentResults } = await import("@/lib/analytics-report");
const { deliverOutbox } = await import("@/lib/notifications");
const { sendEmail } = await import("@/lib/email");
const { sendDevicePush } = await import("@/lib/device-push");
const { GET } = await import("@/app/api/r/route");

const tag = `sweep-${crypto.randomUUID().slice(0, 8)}`;
const userIds: string[] = [];
const teacherIds: string[] = [];
const categoryIds: string[] = [];
const orderIds: string[] = [];
const promoIds: string[] = [];
const experimentIds: string[] = [];

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

describe("PR 7 weekday Bugbot sweep", () => {
  afterAll(async () => {
    if (orderIds.length) await db.delete(schema.orders).where(inArray(schema.orders.id, orderIds));
    if (promoIds.length) await db.delete(schema.promoCodes).where(inArray(schema.promoCodes.id, promoIds));
    if (experimentIds.length) await db.delete(schema.experiments).where(inArray(schema.experiments.id, experimentIds));
    if (userIds.length) {
      await db.delete(schema.notificationOutbox).where(inArray(schema.notificationOutbox.userId, userIds));
      await db.delete(schema.analyticsEvents).where(inArray(schema.analyticsEvents.userId, userIds));
      await db.delete(schema.rateBuckets).where(inArray(schema.rateBuckets.key, userIds.map((id) => `book:${id}`)));
    }
    await db.delete(schema.analyticsEvents).where(sql`${schema.analyticsEvents.anonymousId} like ${`${tag}%`} or ${schema.analyticsEvents.properties}->>'experiment' = ${`${tag}-cta`}`);
    await db.delete(schema.rateBuckets).where(sql`${schema.rateBuckets.key} like ${`%${tag}%`}`);
    await db.delete(schema.analyticsEvents).where(eq(schema.analyticsEvents.path, `/${tag}-shared`));
    await db.delete(schema.rateBuckets).where(inArray(schema.rateBuckets.key, ["api-signin:203.0.113.77", "api-track:unknown", "api-track:203.0.113.41"]));
    if (teacherIds.length) await db.delete(schema.teachers).where(inArray(schema.teachers.id, teacherIds));
    if (userIds.length) await db.delete(schema.user).where(inArray(schema.user.id, userIds));
    if (categoryIds.length) await db.delete(schema.categories).where(inArray(schema.categories.id, categoryIds));
  });

  it("drops a pack hold when the PaymentSheet call throws", async () => {
    const owner = await person("pack-owner");
    const student = await person("pack-student");
    const teacherId = crypto.randomUUID();
    teacherIds.push(teacherId);
    await db.insert(schema.teachers).values({ id: teacherId, userId: owner, slug: `${tag}-studio`, studioName: tag, status: "approved", bio: "", stripeChargesEnabled: true });
    const packId = crypto.randomUUID();
    await db.insert(schema.packs).values({ id: packId, teacherId, slug: `${tag}-pack`, name: "Five", creditCount: 5, priceCents: 4000 });
    const promoId = crypto.randomUUID();
    promoIds.push(promoId);
    await db.insert(schema.promoCodes).values({ id: promoId, code: `${tag}-PACK`.toUpperCase(), discountType: "percent", percentOffBps: 1000, appliesTo: "all", active: true, maxRedemptions: 5 });
    const [studentRow] = await db.select().from(schema.user).where(eq(schema.user.id, student));
    const result = await purchaseOffer({ userId: student, email: studentRow!.email, kind: "pack", id: packId, code: `${tag}-PACK`, paymentSheet: true, platform: "ios" });
    expect(result.error).toMatch(/stripe down/);
    const [order] = await db.select().from(schema.orders).where(eq(schema.orders.userId, student));
    expect(order?.status).toBe("cancelled");
    if (order) orderIds.push(order.id);
    const [redemption] = await db.select().from(schema.promoRedemptions).where(eq(schema.promoRedemptions.orderId, order!.id));
    expect(redemption?.reversed).toBe(true);
    const [purchase] = await db.select().from(schema.packPurchases).where(eq(schema.packPurchases.orderId, order!.id));
    expect(purchase?.creditsRemaining).toBe(0);
  });

  it("stores the mobile platform on paid pack events", async () => {
    const student = await person("ios-student");
    const orderId = crypto.randomUUID();
    orderIds.push(orderId);
    await db.insert(schema.orders).values({
      id: orderId,
      userId: student,
      kind: "pack",
      status: "pending",
      listPriceCents: 4000,
      studentPaysCents: 4000,
      paymentPath: "card",
    });
    await dispatchStripeEvent({
      type: "payment_intent.succeeded",
      data: { object: { id: `${tag}-pi`, metadata: { orderId, platform: "ios" } } },
    } as never);
    const rows = await db.select().from(schema.analyticsEvents).where(and(eq(schema.analyticsEvents.userId, student), eq(schema.analyticsEvents.name, "checkout_completed")));
    expect(rows.map((row) => row.platform)).toEqual(["ios"]);
    const offers = await db.select().from(schema.analyticsEvents).where(and(eq(schema.analyticsEvents.userId, student), eq(schema.analyticsEvents.name, "offer_purchased")));
    expect(offers.map((row) => row.platform)).toEqual(["ios"]);
    await fulfillPaidCheckout(orderId, `${tag}-pi`, null, "android");
    const still = await db.select().from(schema.analyticsEvents).where(and(eq(schema.analyticsEvents.userId, student), eq(schema.analyticsEvents.name, "checkout_completed")));
    expect(still).toHaveLength(1);
  });

  it("offers the vacated seat after a reschedule", async () => {
    const categoryId = crypto.randomUUID();
    categoryIds.push(categoryId);
    await db.insert(schema.categories).values({ id: categoryId, name: "Acting", slug: `${tag}-acting` });
    const owner = await person("move-owner");
    const student = await person("move-student");
    const waiting = await person("move-wait");
    const teacherId = crypto.randomUUID();
    teacherIds.push(teacherId);
    await db.insert(schema.teachers).values({ id: teacherId, userId: owner, slug: `${tag}-move`, studioName: tag, status: "approved", bio: "" });
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
      maxSize: 1,
      durationMinutes: 60,
      pricePerSessionCents: 2500,
      status: "published",
      waitlistEnabled: true,
    });
    const fromId = crypto.randomUUID();
    const toId = crypto.randomUUID();
    await db.insert(schema.sessions).values([
      { id: fromId, classId, startsAt: new Date("2027-04-01T18:00:00Z"), endsAt: new Date("2027-04-01T19:00:00Z"), localDate: "2027-04-01", capacity: 1 },
      { id: toId, classId, startsAt: new Date("2027-04-08T18:00:00Z"), endsAt: new Date("2027-04-08T19:00:00Z"), localDate: "2027-04-08", capacity: 1 },
    ]);
    const bookingId = crypto.randomUUID();
    await db.insert(schema.bookings).values({ id: bookingId, userId: student, classId, kind: "session", status: "confirmed" });
    await db.insert(schema.bookingSessions).values({ id: crypto.randomUUID(), bookingId, sessionId: fromId });
    const waitId = crypto.randomUUID();
    await db.insert(schema.waitlistEntries).values({ id: waitId, sessionId: fromId, userId: waiting, status: "waiting" });
    const same = await rescheduleBooking(student, bookingId, fromId);
    expect(same).toEqual({ ok: true });
    const [stillWaiting] = await db.select().from(schema.waitlistEntries).where(eq(schema.waitlistEntries.id, waitId));
    expect(stillWaiting?.status).toBe("waiting");
    const moved = await rescheduleBooking(student, bookingId, toId);
    expect(moved).toEqual({ ok: true });
    const [offered] = await db.select().from(schema.waitlistEntries).where(eq(schema.waitlistEntries.id, waitId));
    expect(offered?.status).toBe("offered");
  });

  it("requires the cancellation policy and shares the booking rate limit", async () => {
    const student = await person("api-student");
    const raw = await tokenFor(student);
    const denied = await handleMobileApi(new Request("http://localhost/api/v1/bookings", {
      method: "POST",
      headers: { authorization: `Bearer ${raw}`, "content-type": "application/json" },
      body: JSON.stringify({ sessionId: "missing" }),
    }), ["bookings"]);
    expect(denied.status).toBe(400);
    expect(await denied.json()).toEqual({ error: "Accept the cancellation policy to book." });
    const bookings = await db.select().from(schema.bookings).where(eq(schema.bookings.userId, student));
    expect(bookings).toHaveLength(0);

    const capped = await person("capped-student");
    const cappedToken = await tokenFor(capped);
    await db.insert(schema.rateBuckets).values({ key: `book:${capped}`, windowStart: new Date(), count: 30 });
    const limited = await handleMobileApi(new Request("http://localhost/api/v1/bookings", {
      method: "POST",
      headers: { authorization: `Bearer ${cappedToken}`, "content-type": "application/json" },
      body: JSON.stringify({ sessionId: "missing", policyAccepted: true }),
    }), ["bookings"]);
    expect(limited.status).toBe(429);
    const pack = await handleMobileApi(new Request("http://localhost/api/v1/packs/purchase", {
      method: "POST",
      headers: { authorization: `Bearer ${cappedToken}`, "content-type": "application/json" },
      body: JSON.stringify({ id: "missing" }),
    }), ["packs", "purchase"]);
    expect(pack.status).toBe(429);
  });

  it("refuses a shared anonymous experiment subject", async () => {
    const before = await db.select({ id: schema.analyticsEvents.id }).from(schema.analyticsEvents).where(eq(schema.analyticsEvents.anonymousId, "anonymous"));
    const missing = await handleMobileApi(new Request(`http://localhost/api/v1/experiments/${tag}-cta`), ["experiments", `${tag}-cta`]);
    expect(missing.status).toBe(400);
    expect(await missing.json()).toEqual({ error: "Pass a subject id." });
    const shared = await handleMobileApi(new Request(`http://localhost/api/v1/experiments/${tag}-cta?subject=anonymous`), ["experiments", `${tag}-cta`]);
    expect(shared.status).toBe(400);
    const after = await db.select({ id: schema.analyticsEvents.id }).from(schema.analyticsEvents).where(eq(schema.analyticsEvents.anonymousId, "anonymous"));
    expect(after).toHaveLength(before.length);
  });

  it("uses key order as control and ignores pre-exposure goals", async () => {
    const experimentId = crypto.randomUUID();
    experimentIds.push(experimentId);
    await db.insert(schema.experiments).values({ id: experimentId, key: `${tag}-cta`, name: "CTA", status: "draft", goalEvent: "checkout_completed" });
    await db.insert(schema.experimentVariants).values([
      { id: crypto.randomUUID(), experimentId, key: "save_seat", weight: 1, payload: {} },
      { id: crypto.randomUUID(), experimentId, key: "book_this", weight: 1, payload: {} },
    ]);
    const loaded = await loadExperiment(`${tag}-cta`);
    expect(loaded?.variants.map((variant) => variant.key)).toEqual(["book_this", "save_seat"]);
    const assigned = await assignExperiment(`${tag}-cta`, `${tag}-person`);
    expect(assigned?.variant.key).toBe("book_this");
    const exposureAt = new Date("2026-06-01T00:00:00Z");
    await db.insert(schema.analyticsEvents).values([
      { id: crypto.randomUUID(), name: "experiment_exposed", anonymousId: `${tag}-early`, platform: "web", properties: { experiment: `${tag}-cta`, variant: "book_this" }, createdAt: exposureAt },
      { id: crypto.randomUUID(), name: "experiment_exposed", anonymousId: `${tag}-late`, platform: "web", properties: { experiment: `${tag}-cta`, variant: "book_this" }, createdAt: exposureAt },
      { id: crypto.randomUUID(), name: "experiment_exposed", anonymousId: `${tag}-other`, platform: "web", properties: { experiment: `${tag}-cta`, variant: "save_seat" }, createdAt: exposureAt },
      { id: crypto.randomUUID(), name: "checkout_completed", anonymousId: `${tag}-early`, platform: "web", properties: { orderId: `${tag}-old` }, createdAt: new Date("2026-01-01T00:00:00Z") },
      { id: crypto.randomUUID(), name: "checkout_completed", anonymousId: `${tag}-late`, platform: "web", properties: { orderId: `${tag}-new` }, createdAt: new Date("2026-07-01T00:00:00Z") },
    ]);
    const report = await experimentResults(`${tag}-cta`);
    expect(report?.variants.map((variant) => ({ key: variant.key, exposed: variant.exposed, converted: variant.converted }))).toEqual([
      { key: "book_this", exposed: 2, converted: 1 },
      { key: "save_seat", exposed: 1, converted: 0 },
    ]);
  });

  it("does not retry email when device push throws, and skips push without a saved opt-in", async () => {
    const quiet = await person("push-off");
    await db.insert(schema.deviceTokens).values({ id: crypto.randomUUID(), userId: quiet, token: `${tag}-off`, platform: "ios", provider: "expo" });
    const quietOutbox = crypto.randomUUID();
    await db.insert(schema.notificationOutbox).values({ id: quietOutbox, userId: quiet, event: "booking.confirmed", title: "Booked", body: "See you there." });
    vi.mocked(sendDevicePush).mockClear();
    await deliverOutbox(quietOutbox);
    expect(sendDevicePush).not.toHaveBeenCalled();
    const [quietRow] = await db.select().from(schema.notificationOutbox).where(eq(schema.notificationOutbox.id, quietOutbox));
    expect(quietRow?.status).toBe("sent");

    const opted = await person("push-on");
    await db.insert(schema.notificationPreferences).values({
      id: crypto.randomUUID(),
      userId: opted,
      event: "booking.confirmed",
      email: true,
      inApp: false,
      sms: false,
      push: true,
    });
    await db.insert(schema.deviceTokens).values({ id: crypto.randomUUID(), userId: opted, token: `${tag}-on`, platform: "ios", provider: "expo" });
    const outboxId = crypto.randomUUID();
    await db.insert(schema.notificationOutbox).values({ id: outboxId, userId: opted, event: "booking.confirmed", title: "Booked", body: "See you there.", href: "/bookings" });
    vi.mocked(sendEmail).mockClear();
    await deliverOutbox(outboxId);
    await deliverOutbox(outboxId);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const email = vi.mocked(sendEmail).mock.calls[0]?.[0] as { text?: string };
    expect(email.text).toContain("/api/r");
    expect(email.text).toContain("c=email");
    expect(sendDevicePush).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ token: `${tag}-on` })]), "Booked", "See you there.", "/bookings");
    const [row] = await db.select().from(schema.notificationOutbox).where(eq(schema.notificationOutbox.id, outboxId));
    expect(row?.status).toBe("sent");
  });

  it("stores a subject on mobile screen, search, and class views", async () => {
    const categoryId = crypto.randomUUID();
    categoryIds.push(categoryId);
    await db.insert(schema.categories).values({ id: categoryId, name: "Acting", slug: `${tag}-view` });
    const owner = await person("view-owner");
    const student = await person("view-student");
    const raw = await tokenFor(student);
    const teacherId = crypto.randomUUID();
    teacherIds.push(teacherId);
    await db.insert(schema.teachers).values({ id: teacherId, userId: owner, slug: `${tag}-view-studio`, studioName: tag, status: "approved", bio: "" });
    const classId = crypto.randomUUID();
    await db.insert(schema.classes).values({
      id: classId,
      teacherId,
      categoryId,
      slug: `${tag}-view-class`,
      title: "Scene study",
      skillLevel: "all",
      format: "class",
      delivery: "virtual",
      maxSize: 8,
      durationMinutes: 60,
      pricePerSessionCents: 0,
      status: "published",
    });
    const headers = { authorization: `Bearer ${raw}`, "x-platform": "ios" };
    const explore = await handleMobileApi(new Request(`http://localhost/api/v1/explore?anonymousId=${tag}-phone`, { headers }), ["explore"]);
    expect(explore.status).toBe(200);
    const search = await handleMobileApi(new Request(`http://localhost/api/v1/search?q=scene&anonymousId=${tag}-phone`, { headers }), ["search"]);
    expect(search.status).toBe(200);
    const detail = await handleMobileApi(new Request(`http://localhost/api/v1/classes/${tag}-view-class?anonymousId=${tag}-phone`, { headers }), ["classes", `${tag}-view-class`]);
    expect(detail.status).toBe(200);
    const rows = await db.select().from(schema.analyticsEvents).where(eq(schema.analyticsEvents.anonymousId, `${tag}-phone`));
    expect(rows.map((row) => row.name).sort()).toEqual(["class_viewed", "screen_view", "search"]);
    expect(rows.every((row) => row.userId === student)).toBe(true);
  });

  it("drops the shared anonymous subject on track", async () => {
    const headers = { "content-type": "application/json", "x-forwarded-for": "203.0.113.41" };
    const shared = await handleMobileApi(new Request("http://localhost/api/v1/track", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "page_view", anonymousId: "anonymous", path: `/${tag}-shared` }),
    }), ["track"]);
    expect(shared.status).toBe(200);
    const sharedRows = await db.select().from(schema.analyticsEvents).where(eq(schema.analyticsEvents.path, `/${tag}-shared`));
    expect(sharedRows).toHaveLength(1);
    expect(sharedRows[0]?.anonymousId).toBeNull();
    const kept = await handleMobileApi(new Request("http://localhost/api/v1/track", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "page_view", anonymousId: `${tag}-visitor` }),
    }), ["track"]);
    expect(kept.status).toBe(200);
    const keptRows = await db.select().from(schema.analyticsEvents).where(eq(schema.analyticsEvents.anonymousId, `${tag}-visitor`));
    expect(keptRows).toHaveLength(1);
  });

  it("rejects client-posted experiment exposures", async () => {
    const response = await handleMobileApi(new Request("http://localhost/api/v1/track", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.40" },
      body: JSON.stringify({ name: "experiment_exposed", anonymousId: `${tag}-poison`, properties: { experiment: `${tag}-cta`, variant: "save_seat" } }),
    }), ["track"]);
    expect(response.status).toBe(400);
    const rows = await db.select().from(schema.analyticsEvents).where(eq(schema.analyticsEvents.anonymousId, `${tag}-poison`));
    expect(rows).toHaveLength(0);
  });

  it("rate-limits membership purchase with the booking cap", async () => {
    const student = await person("member-student");
    const raw = await tokenFor(student);
    await db.insert(schema.rateBuckets).values({ key: `book:${student}`, windowStart: new Date(), count: 30 });
    const response = await handleMobileApi(new Request("http://localhost/api/v1/memberships/purchase", {
      method: "POST",
      headers: { authorization: `Bearer ${raw}`, "content-type": "application/json" },
      body: JSON.stringify({ id: "missing" }),
    }), ["memberships", "purchase"]);
    expect(response.status).toBe(429);
  });

  it("keeps a spoofed forwarding header on the proxy address", async () => {
    await db.insert(schema.rateBuckets).values({ key: "api-signin:203.0.113.77", windowStart: new Date(), count: 10 });
    const spoofed = await handleMobileApi(new Request("http://localhost/api/v1/auth/sign-in", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "1.2.3.4, 203.0.113.77" },
      body: JSON.stringify({ email: "a@example.com", password: "secret" }),
    }), ["auth", "sign-in"]);
    expect(spoofed.status).toBe(429);
    const rotated = await handleMobileApi(new Request("http://localhost/api/v1/auth/sign-in", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "9.9.9.9, 203.0.113.77" },
      body: JSON.stringify({ email: "b@example.com", password: "secret" }),
    }), ["auth", "sign-in"]);
    expect(rotated.status).toBe(429);
    await db.insert(schema.rateBuckets).values({ key: "api-track:unknown", windowStart: new Date(), count: 120 }).onConflictDoUpdate({ target: schema.rateBuckets.key, set: { count: 120, windowStart: new Date() } });
    const garbage = await handleMobileApi(new Request("http://localhost/api/v1/track", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": `${tag}-rotate` },
      body: JSON.stringify({ name: "screen_view", anonymousId: `${tag}-rotate` }),
    }), ["track"]);
    expect(garbage.status).toBe(429);
  });

  it("stores share attribution from a mobile booking", async () => {
    const categoryId = crypto.randomUUID();
    categoryIds.push(categoryId);
    await db.insert(schema.categories).values({ id: categoryId, name: "Acting", slug: `${tag}-attr` });
    const owner = await person("attr-owner");
    const student = await person("attr-student");
    const raw = await tokenFor(student);
    const teacherId = crypto.randomUUID();
    teacherIds.push(teacherId);
    await db.insert(schema.teachers).values({ id: teacherId, userId: owner, slug: `${tag}-attr-studio`, studioName: tag, status: "approved", bio: "" });
    const classId = crypto.randomUUID();
    await db.insert(schema.classes).values({
      id: classId,
      teacherId,
      categoryId,
      slug: `${tag}-attr-class`,
      title: "Free study",
      skillLevel: "all",
      format: "class",
      delivery: "virtual",
      maxSize: 8,
      durationMinutes: 60,
      pricePerSessionCents: 0,
      status: "published",
    });
    const sessionId = crypto.randomUUID();
    await db.insert(schema.sessions).values({
      id: sessionId,
      classId,
      startsAt: new Date("2027-05-01T18:00:00Z"),
      endsAt: new Date("2027-05-01T19:00:00Z"),
      localDate: "2027-05-01",
      capacity: 8,
    });
    const response = await handleMobileApi(new Request("http://localhost/api/v1/bookings", {
      method: "POST",
      headers: { authorization: `Bearer ${raw}`, "content-type": "application/json", "x-forwarded-for": "203.0.113.50" },
      body: JSON.stringify({ sessionId, policyAccepted: true, ref: `${tag}-bio`, utm_source: "instagram", utmMedium: "social", utmCampaign: "fall" }),
    }), ["bookings"]);
    expect(response.status).toBe(200);
    const [order] = await db.select().from(schema.orders).where(eq(schema.orders.userId, student));
    expect(order?.ref).toBe(`${tag}-bio`);
    expect(order?.utmSource).toBe("instagram");
    expect(order?.utmMedium).toBe("social");
    expect(order?.utmCampaign).toBe("fall");
    if (order) orderIds.push(order.id);
  });

  it("lists only scheduled sessions as open slots", async () => {
    const categoryId = crypto.randomUUID();
    categoryIds.push(categoryId);
    await db.insert(schema.categories).values({ id: categoryId, name: "Acting", slug: `${tag}-slots` });
    const owner = await person("slot-owner");
    const student = await person("slot-student");
    const raw = await tokenFor(student);
    const teacherId = crypto.randomUUID();
    teacherIds.push(teacherId);
    await db.insert(schema.teachers).values({ id: teacherId, userId: owner, slug: `${tag}-slot-studio`, studioName: tag, status: "approved", bio: "" });
    const classId = crypto.randomUUID();
    const slug = `${tag}-slot-class`;
    await db.insert(schema.classes).values({
      id: classId,
      teacherId,
      categoryId,
      slug,
      title: "Open slots",
      skillLevel: "all",
      format: "class",
      delivery: "virtual",
      maxSize: 8,
      durationMinutes: 60,
      pricePerSessionCents: 0,
      status: "published",
    });
    const openId = crypto.randomUUID();
    await db.insert(schema.sessions).values([
      { id: openId, classId, startsAt: new Date("2027-06-01T18:00:00Z"), endsAt: new Date("2027-06-01T19:00:00Z"), localDate: "2027-06-01", capacity: 8, status: "scheduled" },
      { id: crypto.randomUUID(), classId, startsAt: new Date("2027-06-02T18:00:00Z"), endsAt: new Date("2027-06-02T19:00:00Z"), localDate: "2027-06-02", capacity: 8, status: "cancelled" },
      { id: crypto.randomUUID(), classId, startsAt: new Date("2027-06-03T18:00:00Z"), endsAt: new Date("2027-06-03T19:00:00Z"), localDate: "2027-06-03", capacity: 8, status: "paused" },
      { id: crypto.randomUUID(), classId, startsAt: new Date("2027-06-04T18:00:00Z"), endsAt: new Date("2027-06-04T19:00:00Z"), localDate: "2027-06-04", capacity: 8, status: "completed" },
    ]);
    const detail = await handleMobileApi(new Request(`http://localhost/api/v1/classes/${slug}`), ["classes", slug]);
    expect(detail.status).toBe(200);
    const detailBody = await detail.json() as { slots: { id: string }[] };
    expect(detailBody.slots.map((slot) => slot.id)).toEqual([openId]);
    const slots = await handleMobileApi(new Request(`http://localhost/api/v1/classes/slots?slug=${encodeURIComponent(slug)}`, {
      headers: { authorization: `Bearer ${raw}` },
    }), ["classes", "slots"]);
    expect(slots.status).toBe(200);
    const slotsBody = await slots.json() as { slots: { id: string }[] };
    expect(slotsBody.slots.map((slot) => slot.id)).toEqual([openId]);
  });

  it("places a student in the cohort of their first confirmed booking", async () => {
    const categoryId = crypto.randomUUID();
    categoryIds.push(categoryId);
    await db.insert(schema.categories).values({ id: categoryId, name: "Acting", slug: `${tag}-cohort` });
    const owner = await person("cohort-owner");
    const returning = await person("cohort-return");
    const firstTime = await person("cohort-new");
    const teacherId = crypto.randomUUID();
    teacherIds.push(teacherId);
    await db.insert(schema.teachers).values({ id: teacherId, userId: owner, slug: `${tag}-cohort-studio`, studioName: tag, status: "approved", bio: "" });
    const classId = crypto.randomUUID();
    await db.insert(schema.classes).values({
      id: classId,
      teacherId,
      categoryId,
      slug: `${tag}-cohort-class`,
      title: "Cohort study",
      skillLevel: "all",
      format: "class",
      delivery: "virtual",
      maxSize: 8,
      durationMinutes: 60,
      pricePerSessionCents: 0,
      status: "published",
    });
    const to = new Date("2035-06-01T00:00:00Z");
    const day = 86_400_000;
    await db.insert(schema.bookings).values([
      { id: crypto.randomUUID(), userId: returning, classId, kind: "session", status: "confirmed", createdAt: new Date("2034-01-01T00:00:00Z") },
      { id: crypto.randomUUID(), userId: returning, classId, kind: "session", status: "confirmed", createdAt: new Date(to.getTime() - 10 * day) },
      { id: crypto.randomUUID(), userId: firstTime, classId, kind: "session", status: "confirmed", createdAt: new Date("2035-04-01T00:00:00Z") },
      { id: crypto.randomUUID(), userId: firstTime, classId, kind: "session", status: "confirmed", createdAt: new Date(to.getTime() - 27 * day) },
    ]);
    const rows = await cohortRetention({ from: new Date("2035-01-01T00:00:00Z"), to });
    expect(rows.find(([key]) => key === "2035-05")).toBeUndefined();
    expect(rows.find(([key]) => key === "2035-04")?.[1]).toEqual({ size: 1, month1: 1, month2: 0 });
  });

  it("keeps tracking redirects on this site when the target has a backslash", async () => {
    const bad = await GET(new Request(`http://localhost:3000/api/r?to=${encodeURIComponent("/\\evil.example")}`));
    expect(bad.status).toBe(302);
    expect(new URL(bad.headers.get("location")!).pathname).toBe("/");
    const scheme = await GET(new Request(`http://localhost:3000/api/r?to=${encodeURIComponent("/foo://bar")}`));
    expect(new URL(scheme.headers.get("location")!).pathname).toBe("/");
    const ok = await GET(new Request("http://localhost:3000/api/r?to=/bookings"));
    expect(ok.status).toBe(302);
    expect(new URL(ok.headers.get("location")!).pathname).toBe("/bookings");
  });
});
