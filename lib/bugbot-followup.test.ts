import { config } from "dotenv";
import { afterAll, describe, expect, it, vi } from "vitest";

config({ path: ".env.local" });

const { refundCreate, checkoutRetrieve, checkoutExpire } = vi.hoisted(() => ({
  refundCreate: vi.fn(async () => ({ id: "re_test" })),
  checkoutRetrieve: vi.fn(async (): Promise<{ status: string; payment_status: string; payment_intent?: string | null }> => ({ status: "expired", payment_status: "unpaid" })),
  checkoutExpire: vi.fn(async () => ({})),
}));

vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(async () => ({ id: "email" })),
  sendIndividually: vi.fn(async () => ({ id: "batch" })),
}));

vi.mock("@/lib/stripe", async () => {
  const actual = await vi.importActual<typeof import("@/lib/stripe")>("@/lib/stripe");
  return {
    ...actual,
    stripeConfigured: () => true,
    getStripe: () => ({
      refunds: { create: refundCreate },
      checkout: { sessions: { retrieve: checkoutRetrieve, expire: checkoutExpire } },
    }),
    createCheckout: vi.fn(async () => {
      throw new Error("stripe down");
    }),
    createPaymentIntent: vi.fn(async () => {
      throw new Error("stripe down");
    }),
  };
});

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));

const { eq, inArray } = await import("drizzle-orm");
const { db, pool } = await import("@/lib/db");
const schema = await import("@/lib/db/schema");
const { bookSession, cancelBooking, confirmedCount, fulfillPaidCheckout, purchaseOffer, releaseExpiredCheckoutHolds, renewMembershipFromInvoice } = await import("@/lib/booking-service");
const { sendEmail, sendIndividually } = await import("@/lib/email");
const { createCheckout } = await import("@/lib/stripe");
const { classDetail, teacherProfile } = await import("@/lib/queries");
const { mediaUploadAllowed } = await import("@/lib/media-upload");
const { manualBook, saveClass, setPaused, syncRule } = await import("@/lib/studio-service");

const tag = `bugbot-${crypto.randomUUID().slice(0, 8)}`;
const userIds: string[] = [];
const teacherIds: string[] = [];
let categoryId = "";

async function person(name: string) {
  const id = crypto.randomUUID();
  userIds.push(id);
  await db.insert(schema.user).values({ id, name, email: `${tag}-${name}@example.com`, emailVerified: true });
  return id;
}

async function studio(ownerId: string, slug: string, status = "approved") {
  const id = crypto.randomUUID();
  teacherIds.push(id);
  await db.insert(schema.teachers).values({ id, userId: ownerId, slug, studioName: slug, status, bio: "" });
  return id;
}

async function ensureCategory() {
  if (categoryId) return categoryId;
  categoryId = crypto.randomUUID();
  await db.insert(schema.categories).values({ id: categoryId, name: "Acting", slug: `${tag}-acting` });
  return categoryId;
}

describe("Bugbot follow-ups", () => {
  afterAll(async () => {
    if (teacherIds.length) await db.delete(schema.teachers).where(inArray(schema.teachers.id, teacherIds));
    if (userIds.length) await db.delete(schema.user).where(inArray(schema.user.id, userIds));
    if (categoryId) await db.delete(schema.categories).where(eq(schema.categories.id, categoryId));
  });

  it("pauses future sessions without cancelling bookings, then restores them", async () => {
    categoryId = crypto.randomUUID();
    await db.insert(schema.categories).values({ id: categoryId, name: "Acting", slug: `${tag}-acting` });
    const owner = await person("owner");
    const student = await person("student");
    const teacherId = await studio(owner, `${tag}-studio`);
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
    const recurrenceId = crypto.randomUUID();
    await db.insert(schema.recurrences).values({
      id: recurrenceId,
      classId,
      timezone: "America/Los_Angeles",
      frequency: "weekly",
      days: [{ weekday: 1, time: "18:00" }],
      startDate: "2026-10-05",
      endType: "never",
      durationMinutes: 60,
      capacity: 8,
    });
    await syncRule(recurrenceId, "2026-10-08");
    const before = await db.select().from(schema.sessions).where(eq(schema.sessions.recurrenceId, recurrenceId));
    expect(before.length).toBeGreaterThan(0);
    const bookedSession = before.find((session) => session.localDate >= "2026-10-19");
    expect(bookedSession).toBeTruthy();
    const bookingId = crypto.randomUUID();
    await db.insert(schema.bookings).values({
      id: bookingId,
      userId: student,
      classId,
      kind: "session",
      status: "confirmed",
    });
    await db.insert(schema.bookingSessions).values({ id: crypto.randomUUID(), bookingId, sessionId: bookedSession!.id });
    vi.mocked(sendIndividually).mockClear();

    await setPaused(recurrenceId, true, owner, false, teacherId);

    const paused = await db.select().from(schema.sessions).where(eq(schema.sessions.recurrenceId, recurrenceId));
    expect(paused.map((session) => session.id).sort()).toEqual(before.map((session) => session.id).sort());
    const held = paused.find((session) => session.id === bookedSession!.id);
    expect(held?.status).toBe("paused");
    expect(held?.cancellationReason).toBeNull();
    expect(paused.some((session) => session.status === "cancelled")).toBe(false);
    const [booking] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, bookingId));
    expect(booking?.status).toBe("confirmed");
    expect(vi.mocked(sendIndividually)).not.toHaveBeenCalled();

    await setPaused(recurrenceId, false, owner, false, teacherId);
    const restored = await db.select().from(schema.sessions).where(eq(schema.sessions.id, bookedSession!.id));
    expect(restored[0]?.status).toBe("scheduled");
    const [stillBooked] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, bookingId));
    expect(stillBooked?.status).toBe("confirmed");
  });

  it("refuses a manual booking when the session belongs to another class", async () => {
    const owner = await person("manual-owner");
    const otherOwner = await person("other-owner");
    const teacherId = await studio(owner, `${tag}-manual`);
    const otherTeacherId = await studio(otherOwner, `${tag}-other`);
    const classId = crypto.randomUUID();
    const otherClassId = crypto.randomUUID();
    await db.insert(schema.classes).values([
      { id: classId, teacherId, categoryId, slug: `${tag}-mine`, title: "Mine", skillLevel: "all", format: "class", delivery: "virtual", maxSize: 8, durationMinutes: 60, pricePerSessionCents: 2500, status: "published" },
      { id: otherClassId, teacherId: otherTeacherId, categoryId, slug: `${tag}-theirs`, title: "Theirs", skillLevel: "all", format: "class", delivery: "virtual", maxSize: 8, durationMinutes: 60, pricePerSessionCents: 2500, status: "published" },
    ]);
    const sessionId = crypto.randomUUID();
    await db.insert(schema.sessions).values({
      id: sessionId,
      classId: otherClassId,
      startsAt: new Date("2026-11-02T18:00:00Z"),
      endsAt: new Date("2026-11-02T19:00:00Z"),
      localDate: "2026-11-02",
      capacity: 8,
    });
    const mismatched = await manualBook({
      classId,
      sessionId,
      teacherId,
      name: "Guest",
      email: "guest@example.com",
      payment: "pay_at_studio",
      override: false,
      actorUserId: owner,
      delegated: false,
    });
    expect(mismatched).toEqual({ error: "That session is not part of this class." });
    const foreign = await manualBook({
      classId: otherClassId,
      sessionId,
      teacherId,
      name: "Guest",
      email: "guest@example.com",
      payment: "pay_at_studio",
      override: false,
      actorUserId: owner,
      delegated: false,
    });
    expect(foreign).toEqual({ error: "That class belongs to another studio." });
    const links = await db.select().from(schema.bookingSessions).where(eq(schema.bookingSessions.sessionId, sessionId));
    expect(links).toHaveLength(0);
  });

  it("releases the seat when Stripe throws during checkout", async () => {
    const owner = await person("pay-owner");
    const student = await person("pay-student");
    const teacherId = await studio(owner, `${tag}-pay`);
    const classId = crypto.randomUUID();
    await db.insert(schema.classes).values({
      id: classId,
      teacherId,
      categoryId,
      slug: `${tag}-pay-class`,
      title: "Paid class",
      skillLevel: "all",
      format: "class",
      delivery: "virtual",
      maxSize: 8,
      durationMinutes: 60,
      pricePerSessionCents: 2500,
      status: "published",
    });
    const sessionId = crypto.randomUUID();
    await db.insert(schema.sessions).values({
      id: sessionId,
      classId,
      startsAt: new Date("2026-12-07T18:00:00Z"),
      endsAt: new Date("2026-12-07T19:00:00Z"),
      localDate: "2026-12-07",
      capacity: 8,
    });
    const [studentRow] = await db.select().from(schema.user).where(eq(schema.user.id, student));
    const result = await bookSession({ userId: student, email: studentRow!.email, name: studentRow!.name, sessionId });
    expect(result.error).toBe("stripe down");
    const held = await db.select().from(schema.bookings).where(eq(schema.bookings.userId, student));
    expect(held.every((booking) => booking.status === "cancelled")).toBe(true);
    expect(held.some((booking) => booking.status === "confirmed")).toBe(false);
    const orderIds = held.map((booking) => booking.orderId).filter((id): id is string => Boolean(id));
    const orderRows = orderIds.length ? await db.select().from(schema.orders).where(inArray(schema.orders.id, orderIds)) : [];
    expect(orderRows.every((order) => order.status === "cancelled")).toBe(true);
  });

  it("does not let two checkouts spend the same pack credit", async () => {
    const cat = await ensureCategory();
    const owner = await person("pack-owner");
    const student = await person("pack-student");
    const teacherId = await studio(owner, `${tag}-pack`);
    const classId = crypto.randomUUID();
    await db.insert(schema.classes).values({
      id: classId, teacherId, categoryId: cat, slug: `${tag}-pack-class`, title: "Pack class", skillLevel: "all", format: "class", delivery: "virtual", maxSize: 8, durationMinutes: 60, pricePerSessionCents: 2500, status: "published",
    });
    const firstId = crypto.randomUUID();
    const secondId = crypto.randomUUID();
    await db.insert(schema.sessions).values([
      { id: firstId, classId, startsAt: new Date("2027-01-04T18:00:00Z"), endsAt: new Date("2027-01-04T19:00:00Z"), localDate: "2027-01-04", capacity: 8 },
      { id: secondId, classId, startsAt: new Date("2027-01-11T18:00:00Z"), endsAt: new Date("2027-01-11T19:00:00Z"), localDate: "2027-01-11", capacity: 8 },
    ]);
    const packId = crypto.randomUUID();
    const purchaseId = crypto.randomUUID();
    await db.insert(schema.packs).values({ id: packId, teacherId, slug: `${tag}-pack`, name: "One credit", creditCount: 1, priceCents: 2500 });
    await db.insert(schema.packPurchases).values({ id: purchaseId, userId: student, packId, teacherId, creditsTotal: 1, creditsRemaining: 1 });
    const [studentRow] = await db.select().from(schema.user).where(eq(schema.user.id, student));
    const [first, second] = await Promise.all([
      bookSession({ userId: student, email: studentRow!.email, name: studentRow!.name, sessionId: firstId, payWith: `pack:${purchaseId}` }),
      bookSession({ userId: student, email: studentRow!.email, name: studentRow!.name, sessionId: secondId, payWith: `pack:${purchaseId}` }),
    ]);
    const results = [first, second];
    expect(results.filter((result) => !result.error)).toHaveLength(1);
    expect(results.filter((result) => result.error)).toHaveLength(1);
    const [purchase] = await db.select().from(schema.packPurchases).where(eq(schema.packPurchases.id, purchaseId));
    expect(purchase?.creditsRemaining).toBe(0);
    const confirmed = await db.select().from(schema.bookings).where(eq(schema.bookings.userId, student));
    expect(confirmed.filter((booking) => booking.status === "confirmed")).toHaveLength(1);
  });

  it("does not let two checkouts spend the same membership class", async () => {
    const cat = await ensureCategory();
    const owner = await person("member-owner");
    const student = await person("member-student");
    const teacherId = await studio(owner, `${tag}-member`);
    const classId = crypto.randomUUID();
    await db.insert(schema.classes).values({
      id: classId, teacherId, categoryId: cat, slug: `${tag}-member-class`, title: "Member class", skillLevel: "all", format: "class", delivery: "virtual", maxSize: 8, durationMinutes: 60, pricePerSessionCents: 2500, status: "published",
    });
    const firstId = crypto.randomUUID();
    const secondId = crypto.randomUUID();
    await db.insert(schema.sessions).values([
      { id: firstId, classId, startsAt: new Date("2027-05-03T18:00:00Z"), endsAt: new Date("2027-05-03T19:00:00Z"), localDate: "2027-05-03", capacity: 8 },
      { id: secondId, classId, startsAt: new Date("2027-05-10T18:00:00Z"), endsAt: new Date("2027-05-10T19:00:00Z"), localDate: "2027-05-10", capacity: 8 },
    ]);
    const planId = crypto.randomUUID();
    const subId = crypto.randomUUID();
    await db.insert(schema.memberships).values({ id: planId, teacherId, slug: `${tag}-plan`, name: "One class", termMonths: 1, kind: "limited", classesPerPeriod: 1, priceCents: 4000 });
    await db.insert(schema.membershipSubscriptions).values({
      id: subId, userId: student, membershipId: planId, teacherId, status: "active", currentPeriodStart: new Date("2026-10-01T00:00:00Z"), currentPeriodEnd: new Date("2027-10-01T00:00:00Z"), classesUsedThisPeriod: 0, classesPerPeriod: 1, unlimited: false,
    });
    const [studentRow] = await db.select().from(schema.user).where(eq(schema.user.id, student));
    const [first, second] = await Promise.all([
      bookSession({ userId: student, email: studentRow!.email, name: studentRow!.name, sessionId: firstId, payWith: `membership:${subId}` }),
      bookSession({ userId: student, email: studentRow!.email, name: studentRow!.name, sessionId: secondId, payWith: `membership:${subId}` }),
    ]);
    expect([first, second].filter((result) => !result.error)).toHaveLength(1);
    const [sub] = await db.select().from(schema.membershipSubscriptions).where(eq(schema.membershipSubscriptions.id, subId));
    expect(sub?.classesUsedThisPeriod).toBe(1);
  });

  it("redeems the intro offer once when two checkouts race", async () => {
    const cat = await ensureCategory();
    const owner = await person("intro-owner");
    const student = await person("intro-student");
    const teacherId = await studio(owner, `${tag}-intro`);
    const classId = crypto.randomUUID();
    await db.insert(schema.classes).values({
      id: classId, teacherId, categoryId: cat, slug: `${tag}-intro-class`, title: "Intro class", skillLevel: "all", format: "class", delivery: "virtual", maxSize: 8, durationMinutes: 60, pricePerSessionCents: 2500, firstClassFree: true, status: "published",
    });
    const firstId = crypto.randomUUID();
    const secondId = crypto.randomUUID();
    await db.insert(schema.sessions).values([
      { id: firstId, classId, startsAt: new Date("2027-06-07T18:00:00Z"), endsAt: new Date("2027-06-07T19:00:00Z"), localDate: "2027-06-07", capacity: 8 },
      { id: secondId, classId, startsAt: new Date("2027-06-14T18:00:00Z"), endsAt: new Date("2027-06-14T19:00:00Z"), localDate: "2027-06-14", capacity: 8 },
    ]);
    const [studentRow] = await db.select().from(schema.user).where(eq(schema.user.id, student));
    await Promise.all([
      bookSession({ userId: student, email: studentRow!.email, name: studentRow!.name, sessionId: firstId }),
      bookSession({ userId: student, email: studentRow!.email, name: studentRow!.name, sessionId: secondId }),
    ]);
    const redemptions = await db.select().from(schema.introRedemptions).where(eq(schema.introRedemptions.userId, student));
    expect(redemptions.filter((row) => !row.restored)).toHaveLength(1);
    const orders = await db.select().from(schema.orders).where(eq(schema.orders.userId, student));
    expect(orders.filter((order) => order.studentPaysCents === 0 && order.status === "paid")).toHaveLength(1);
  });

  it("refunds only the sessions that have not started", async () => {
    const cat = await ensureCategory();
    const owner = await person("series-owner");
    const student = await person("series-student");
    const teacherId = await studio(owner, `${tag}-series`);
    const classId = crypto.randomUUID();
    await db.insert(schema.classes).values({
      id: classId, teacherId, categoryId: cat, slug: `${tag}-series-class`, title: "Series", skillLevel: "all", format: "class", delivery: "virtual", maxSize: 8, durationMinutes: 60, pricePerSessionCents: 2500, pricePerSeriesCents: 8000, seriesBookingEnabled: true, status: "published",
    });
    const pastId = crypto.randomUUID();
    const futureId = crypto.randomUUID();
    await db.insert(schema.sessions).values([
      { id: pastId, classId, startsAt: new Date("2026-10-01T18:00:00Z"), endsAt: new Date("2026-10-01T19:00:00Z"), localDate: "2026-10-01", capacity: 8 },
      { id: futureId, classId, startsAt: new Date("2027-02-01T18:00:00Z"), endsAt: new Date("2027-02-01T19:00:00Z"), localDate: "2027-02-01", capacity: 8 },
    ]);
    const orderId = crypto.randomUUID();
    const bookingId = crypto.randomUUID();
    await db.insert(schema.orders).values({
      id: orderId, userId: student, teacherId, kind: "booking", status: "paid", listPriceCents: 8000, studentPaysCents: 8000, platformFeeCents: 800, teacherAmountCents: 7200, paymentPath: "card", stripePaymentIntentId: `pi_${tag}`,
    });
    await db.insert(schema.bookings).values({ id: bookingId, orderId, userId: student, classId, kind: "series", status: "confirmed" });
    await db.insert(schema.bookingSessions).values([
      { id: crypto.randomUUID(), bookingId, sessionId: pastId },
      { id: crypto.randomUUID(), bookingId, sessionId: futureId },
    ]);
    refundCreate.mockClear();
    const result = await cancelBooking(student, bookingId);
    expect(result).toEqual({ ok: true });
    expect(refundCreate).toHaveBeenCalledWith({ payment_intent: `pi_${tag}`, amount: 4000 });
    const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
    expect(order?.status).toBe("paid");
    const [booking] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, bookingId));
    expect(booking?.status).toBe("cancelled");
  });

  it("books from the session row locked in this transaction", async () => {
    const cat = await ensureCategory();
    const owner = await person("lock-owner");
    const student = await person("lock-student");
    const teacherId = await studio(owner, `${tag}-lock`);
    const classId = crypto.randomUUID();
    await db.insert(schema.classes).values({
      id: classId, teacherId, categoryId: cat, slug: `${tag}-lock-class`, title: "Lock class", skillLevel: "all", format: "class", delivery: "virtual", maxSize: 8, durationMinutes: 60, pricePerSessionCents: 0, status: "published",
    });
    const sessionId = crypto.randomUUID();
    await db.insert(schema.sessions).values({
      id: sessionId, classId, startsAt: new Date("2027-03-02T18:00:00Z"), endsAt: new Date("2027-03-02T19:00:00Z"), localDate: "2027-03-02", capacity: 8,
    });
    const [studentRow] = await db.select().from(schema.user).where(eq(schema.user.id, student));
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("select id from sessions where id = $1 for update", [sessionId]);
      const pending = bookSession({ userId: student, email: studentRow!.email, name: studentRow!.name, sessionId });
      let sawWaiter = false;
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        const locks = await client.query("select count(*)::int as n from pg_locks where granted = false");
        if (Number(locks.rows[0]?.n ?? 0) > 0) {
          sawWaiter = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 40));
      }
      expect(sawWaiter).toBe(true);
      await client.query("update sessions set status = 'cancelled' where id = $1", [sessionId]);
      await client.query("commit");
      const result = await pending;
      expect(result.error).toBeTruthy();
      const confirmed = await db.select().from(schema.bookings).where(eq(schema.bookings.userId, student));
      expect(confirmed.filter((booking) => booking.status === "confirmed")).toHaveLength(0);
    } finally {
      await client.query("rollback").catch(() => undefined);
      client.release();
    }
  });

  it("counts one student once when a drop-in and a series share a session", async () => {
    const cat = await ensureCategory();
    const owner = await person("seat-owner");
    const student = await person("seat-student");
    const other = await person("seat-other");
    const teacherId = await studio(owner, `${tag}-seat`);
    const classId = crypto.randomUUID();
    await db.insert(schema.classes).values({
      id: classId, teacherId, categoryId: cat, slug: `${tag}-seat-class`, title: "Seats", skillLevel: "all", format: "class", delivery: "virtual", maxSize: 2, durationMinutes: 60, pricePerSessionCents: 0, status: "published",
    });
    const sessionId = crypto.randomUUID();
    await db.insert(schema.sessions).values({
      id: sessionId, classId, startsAt: new Date("2027-04-05T18:00:00Z"), endsAt: new Date("2027-04-05T19:00:00Z"), localDate: "2027-04-05", capacity: 2,
    });
    const dropIn = crypto.randomUUID();
    const series = crypto.randomUUID();
    await db.insert(schema.bookings).values([
      { id: dropIn, userId: student, classId, kind: "session", status: "confirmed" },
      { id: series, userId: student, classId, kind: "series", status: "confirmed" },
    ]);
    await db.insert(schema.bookingSessions).values([
      { id: crypto.randomUUID(), bookingId: dropIn, sessionId },
      { id: crypto.randomUUID(), bookingId: series, sessionId },
    ]);
    expect(await confirmedCount(sessionId)).toBe(1);
    const [otherRow] = await db.select().from(schema.user).where(eq(schema.user.id, other));
    const booked = await bookSession({ userId: other, email: otherRow!.email, name: otherRow!.name, sessionId });
    expect(booked.error).toBeUndefined();
    expect(await confirmedCount(sessionId)).toBe(2);
  });

  it("hides a rejected studio from the public profile used by the embed", async () => {
    const cat = await ensureCategory();
    const owner = await person("embed-owner");
    const teacherId = await studio(owner, `${tag}-rejected`, "rejected");
    await db.insert(schema.classes).values({
      id: crypto.randomUUID(), teacherId, categoryId: cat, slug: `${tag}-rejected-class`, title: "Hidden", skillLevel: "all", format: "class", delivery: "virtual", maxSize: 8, durationMinutes: 60, pricePerSessionCents: 2500, status: "published",
    });
    expect(await teacherProfile(`${tag}-rejected`)).toBeNull();
  });

  it("extends a membership when a renewal invoice is paid and ignores the first invoice", async () => {
    const owner = await person("renew-owner");
    const student = await person("renew-student");
    const teacherId = await studio(owner, `${tag}-renew`);
    const planId = crypto.randomUUID();
    await db.insert(schema.memberships).values({
      id: planId, teacherId, slug: `${tag}-plan`, name: "Monthly", termMonths: 1, kind: "limited", classesPerPeriod: 4, priceCents: 5000,
    });
    const orderId = crypto.randomUUID();
    await db.insert(schema.orders).values({
      id: orderId, userId: student, teacherId, kind: "membership", status: "paid", listPriceCents: 5000, studentPaysCents: 5000, platformFeeCents: 500, teacherAmountCents: 4500, paymentPath: "card", stripeSubscriptionId: `${tag}-sub`,
    });
    const subId = crypto.randomUUID();
    await db.insert(schema.membershipSubscriptions).values({
      id: subId, orderId, userId: student, membershipId: planId, teacherId, status: "active", currentPeriodStart: new Date("2026-11-01T00:00:00Z"), currentPeriodEnd: new Date("2026-12-01T00:00:00Z"), classesUsedThisPeriod: 2, classesPerPeriod: 4, unlimited: false,
    });
    const created = await renewMembershipFromInvoice({
      subscriptionId: `${tag}-sub`, invoiceId: `${tag}-create`, billingReason: "subscription_create", amountPaidCents: 5000, paymentIntentId: `${tag}-pi-create`, periodStart: new Date("2026-11-01T00:00:00Z"), periodEnd: new Date("2026-12-01T00:00:00Z"),
    });
    expect(created.extended).toBe(false);
    const renewed = await renewMembershipFromInvoice({
      subscriptionId: `${tag}-sub`, invoiceId: `${tag}-cycle`, billingReason: "subscription_cycle", amountPaidCents: 5000, paymentIntentId: `${tag}-pi-cycle`, periodStart: new Date("2026-12-01T00:00:00Z"), periodEnd: new Date("2027-01-01T00:00:00Z"),
    });
    expect(renewed.extended).toBe(true);
    const again = await renewMembershipFromInvoice({
      subscriptionId: `${tag}-sub`, invoiceId: `${tag}-cycle`, billingReason: "subscription_cycle", amountPaidCents: 5000, paymentIntentId: `${tag}-pi-cycle`, periodStart: new Date("2026-12-01T00:00:00Z"), periodEnd: new Date("2027-01-01T00:00:00Z"),
    });
    expect(again.extended).toBe(false);
    const [sub] = await db.select().from(schema.membershipSubscriptions).where(eq(schema.membershipSubscriptions.id, subId));
    expect(sub?.currentPeriodEnd.toISOString()).toBe("2027-01-01T00:00:00.000Z");
    expect(sub?.classesUsedThisPeriod).toBe(0);
    const [renewal] = await db.select().from(schema.orders).where(eq(schema.orders.id, `renewal:${tag}-cycle`));
    expect(renewal?.status).toBe("paid");
    expect(renewal?.studentPaysCents).toBe(5000);
    expect(renewal?.platformFeeCents).toBe(500);
    expect(renewal?.teacherAmountCents).toBe(4500);
  });

  it("cancels a pack order when Stripe checkout throws", async () => {
    const owner = await person("offer-owner");
    const student = await person("offer-student");
    const teacherId = await studio(owner, `${tag}-offer`);
    const packId = crypto.randomUUID();
    await db.insert(schema.packs).values({ id: packId, teacherId, slug: `${tag}-pack`, name: "Five", creditCount: 5, priceCents: 4000 });
    const promoId = crypto.randomUUID();
    await db.insert(schema.promoCodes).values({ id: promoId, code: `${tag}-PACK`.toUpperCase(), discountType: "percent", percentOffBps: 1000, appliesTo: "all", active: true, maxRedemptions: 5 });
    const [studentRow] = await db.select().from(schema.user).where(eq(schema.user.id, student));
    const result = await purchaseOffer({ userId: student, email: studentRow!.email, kind: "pack", id: packId, code: `${tag}-PACK` });
    expect(result.error).toMatch(/stripe down/);
    const [order] = await db.select().from(schema.orders).where(eq(schema.orders.userId, student));
    expect(order?.status).toBe("cancelled");
    const [redemption] = await db.select().from(schema.promoRedemptions).where(eq(schema.promoRedemptions.orderId, order!.id));
    expect(redemption?.reversed).toBe(true);
    const [purchase] = await db.select().from(schema.packPurchases).where(eq(schema.packPurchases.orderId, order!.id));
    expect(purchase?.creditsRemaining).toBe(0);
  });

  it("lets only one checkout redeem a limited code", async () => {
    const owner = await person("promo-owner");
    const first = await person("promo-a");
    const second = await person("promo-b");
    const teacherId = await studio(owner, `${tag}-promo`);
    const packId = crypto.randomUUID();
    await db.insert(schema.packs).values({ id: packId, teacherId, slug: `${tag}-limit-pack`, name: "One", creditCount: 1, priceCents: 3000 });
    await db.insert(schema.promoCodes).values({ id: crypto.randomUUID(), code: `${tag}-ONCE`.toUpperCase(), discountType: "amount", amountOffCents: 100, appliesTo: "all", active: true, maxRedemptions: 1 });
    const checkout = createCheckout as ReturnType<typeof vi.fn>;
    checkout.mockResolvedValue(null);
    try {
      const [aRow] = await db.select().from(schema.user).where(eq(schema.user.id, first));
      const [bRow] = await db.select().from(schema.user).where(eq(schema.user.id, second));
      const [a, b] = await Promise.all([
        purchaseOffer({ userId: first, email: aRow!.email, kind: "pack", id: packId, code: `${tag}-ONCE` }),
        purchaseOffer({ userId: second, email: bRow!.email, kind: "pack", id: packId, code: `${tag}-ONCE` }),
      ]);
      const errors = [a, b].map((result) => result.error).filter(Boolean);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/redemption limit/);
      const redemptions = await db.select().from(schema.promoRedemptions).where(eq(schema.promoRedemptions.userId, first));
      const other = await db.select().from(schema.promoRedemptions).where(eq(schema.promoRedemptions.userId, second));
      expect([...redemptions, ...other].filter((row) => !row.reversed)).toHaveLength(1);
    } finally {
      checkout.mockImplementation(async () => {
        throw new Error("stripe down");
      });
    }
  });

  it("emails the next waitlisted student when a seat opens", async () => {
    const cat = await ensureCategory();
    const owner = await person("wait-owner");
    const holder = await person("wait-holder");
    const waiting = await person("wait-next");
    const teacherId = await studio(owner, `${tag}-wait`);
    const classId = crypto.randomUUID();
    await db.insert(schema.classes).values({
      id: classId, teacherId, categoryId: cat, slug: `${tag}-wait-class`, title: "Waitlist class", skillLevel: "all", format: "class", delivery: "virtual", maxSize: 1, durationMinutes: 60, pricePerSessionCents: 0, waitlistEnabled: true, status: "published",
    });
    const sessionId = crypto.randomUUID();
    await db.insert(schema.sessions).values({
      id: sessionId, classId, startsAt: new Date("2027-05-01T18:00:00Z"), endsAt: new Date("2027-05-01T19:00:00Z"), localDate: "2027-05-01", capacity: 1,
    });
    const [holderRow] = await db.select().from(schema.user).where(eq(schema.user.id, holder));
    const [waitingRow] = await db.select().from(schema.user).where(eq(schema.user.id, waiting));
    const booked = await bookSession({ userId: holder, email: holderRow!.email, name: holderRow!.name, sessionId });
    expect(booked.error).toBeUndefined();
    const queued = await bookSession({ userId: waiting, email: waitingRow!.email, name: waitingRow!.name, sessionId });
    expect(queued.waitlisted).toBe(true);
    vi.mocked(sendEmail).mockClear();
    const bookingId = booked.orderId
      ? (await db.select().from(schema.bookings).where(eq(schema.bookings.orderId, booked.orderId)))[0]?.id
      : undefined;
    expect(bookingId).toBeTruthy();
    const cancelled = await cancelBooking(holder, bookingId!);
    expect(cancelled).toEqual({ ok: true });
    const [entry] = await db.select().from(schema.waitlistEntries).where(eq(schema.waitlistEntries.userId, waiting));
    expect(entry?.status).toBe("offered");
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: [waitingRow!.email], subject: "A seat opened: Waitlist class" }));
  });

  it("does not call Stripe while a class page counts seats", async () => {
    const cat = await ensureCategory();
    const owner = await person("page-owner");
    const teacherId = await studio(owner, `${tag}-page`);
    const classId = crypto.randomUUID();
    const slug = `${tag}-page-class`;
    await db.insert(schema.classes).values({
      id: classId, teacherId, categoryId: cat, slug, title: "Page", skillLevel: "all", format: "class", delivery: "virtual", maxSize: 8, durationMinutes: 60, pricePerSessionCents: 2500, status: "published",
    });
    const sessionId = crypto.randomUUID();
    await db.insert(schema.sessions).values({
      id: sessionId, classId, startsAt: new Date("2027-06-01T18:00:00Z"), endsAt: new Date("2027-06-01T19:00:00Z"), localDate: "2027-06-01", capacity: 8,
    });
    const student = await person("page-student");
    const orderId = crypto.randomUUID();
    const bookingId = crypto.randomUUID();
    await db.insert(schema.orders).values({
      id: orderId, userId: student, teacherId, kind: "booking", status: "pending", studentPaysCents: 2500, paymentPath: "card", stripeCheckoutSessionId: `cs_${tag}`, createdAt: new Date("2020-01-01T00:00:00Z"),
    });
    await db.insert(schema.bookings).values({ id: bookingId, orderId, userId: student, classId, kind: "session", status: "confirmed" });
    await db.insert(schema.bookingSessions).values({ id: crypto.randomUUID(), bookingId, sessionId });
    checkoutRetrieve.mockClear();
    const detail = await classDetail(slug);
    expect(detail?.upcoming.length).toBeGreaterThan(0);
    expect(checkoutRetrieve).not.toHaveBeenCalled();
    const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
    expect(order?.status).toBe("pending");
  });

  it("expires an open Stripe checkout when a student cancels an unpaid hold", async () => {
    const cat = await ensureCategory();
    const owner = await person("hold-owner");
    const student = await person("hold-student");
    const teacherId = await studio(owner, `${tag}-hold`);
    const classId = crypto.randomUUID();
    await db.insert(schema.classes).values({
      id: classId, teacherId, categoryId: cat, slug: `${tag}-hold-class`, title: "Hold", skillLevel: "all", format: "class", delivery: "virtual", maxSize: 8, durationMinutes: 60, pricePerSessionCents: 2500, status: "published",
    });
    const sessionId = crypto.randomUUID();
    await db.insert(schema.sessions).values({
      id: sessionId, classId, startsAt: new Date("2027-08-01T18:00:00Z"), endsAt: new Date("2027-08-01T19:00:00Z"), localDate: "2027-08-01", capacity: 8,
    });
    const orderId = crypto.randomUUID();
    const bookingId = crypto.randomUUID();
    const checkoutId = `cs_hold_${tag}`;
    await db.insert(schema.orders).values({
      id: orderId, userId: student, teacherId, kind: "booking", status: "pending", studentPaysCents: 2500, paymentPath: "card", stripeCheckoutSessionId: checkoutId,
    });
    await db.insert(schema.bookings).values({ id: bookingId, orderId, userId: student, classId, kind: "session", status: "confirmed" });
    await db.insert(schema.bookingSessions).values({ id: crypto.randomUUID(), bookingId, sessionId });
    checkoutRetrieve.mockResolvedValue({ status: "open", payment_status: "unpaid" });
    checkoutExpire.mockClear();
    refundCreate.mockClear();
    const result = await cancelBooking(student, bookingId);
    expect(result).toEqual({ ok: true });
    expect(checkoutExpire).toHaveBeenCalledWith(checkoutId);
    expect(refundCreate).not.toHaveBeenCalled();
    const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
    expect(order?.status).toBe("cancelled");
    const [booking] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, bookingId));
    expect(booking?.status).toBe("cancelled");
    checkoutRetrieve.mockResolvedValue({ status: "expired", payment_status: "unpaid" });
  });

  it("refunds an order that becomes paid while the student is cancelling", async () => {
    const cat = await ensureCategory();
    const owner = await person("race-owner");
    const student = await person("race-student");
    const teacherId = await studio(owner, `${tag}-race`);
    const classId = crypto.randomUUID();
    await db.insert(schema.classes).values({
      id: classId, teacherId, categoryId: cat, slug: `${tag}-race-class`, title: "Race", skillLevel: "all", format: "class", delivery: "virtual", maxSize: 8, durationMinutes: 60, pricePerSessionCents: 2500, status: "published",
    });
    const sessionId = crypto.randomUUID();
    await db.insert(schema.sessions).values({
      id: sessionId, classId, startsAt: new Date("2027-09-01T18:00:00Z"), endsAt: new Date("2027-09-01T19:00:00Z"), localDate: "2027-09-01", capacity: 8,
    });
    const orderId = crypto.randomUUID();
    const bookingId = crypto.randomUUID();
    const paymentIntent = `pi_race_${tag}`;
    await db.insert(schema.orders).values({
      id: orderId, userId: student, teacherId, kind: "booking", status: "pending", studentPaysCents: 2500, paymentPath: "card", stripeCheckoutSessionId: `cs_race_${tag}`,
    });
    await db.insert(schema.bookings).values({ id: bookingId, orderId, userId: student, classId, kind: "session", status: "confirmed" });
    await db.insert(schema.bookingSessions).values({ id: crypto.randomUUID(), bookingId, sessionId });
    checkoutRetrieve.mockResolvedValue({ status: "open", payment_status: "unpaid" });
    checkoutExpire.mockImplementation(async () => {
      await db.update(schema.orders).set({ status: "paid", stripePaymentIntentId: paymentIntent }).where(eq(schema.orders.id, orderId));
      return {};
    });
    refundCreate.mockClear();
    const result = await cancelBooking(student, bookingId);
    expect(result).toEqual({ ok: true });
    expect(refundCreate).toHaveBeenCalledWith({ payment_intent: paymentIntent });
    const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
    expect(order?.status).toBe("refunded");
    checkoutExpire.mockReset();
    checkoutExpire.mockResolvedValue({});
    checkoutRetrieve.mockResolvedValue({ status: "expired", payment_status: "unpaid" });
  });

  it("reuses the location row when an in-person class is edited", async () => {
    const cat = await ensureCategory();
    const owner = await person("loc-owner");
    const teacherId = await studio(owner, `${tag}-loc`);
    const place = {
      actorUserId: owner,
      teacherId,
      delegated: false,
      title: "Pin class",
      description: "",
      outcomes: "",
      prerequisites: "",
      whatToBring: "",
      categoryId: cat,
      skillLevel: "all",
      format: "class",
      delivery: "in_person",
      maxSize: 10,
      durationMinutes: 60,
      pricePerSessionCents: 2000,
      pricePerSeriesCents: null,
      seriesBookingEnabled: false,
      firstClassFree: false,
      waitlistEnabled: false,
      publish: true,
      venueName: "Room A",
      address: "100 Hollywood Blvd",
      neighborhood: "Hollywood",
      city: "Los Angeles",
      postalCode: "90028",
    };
    const created = await saveClass(place);
    if ("error" in created) throw new Error(created.error);
    const [first] = await db.select().from(schema.classes).where(eq(schema.classes.id, created.classId));
    const edited = await saveClass({ ...place, classId: created.classId, title: "Pin class renamed" });
    if ("error" in edited) throw new Error(edited.error);
    const [second] = await db.select().from(schema.classes).where(eq(schema.classes.id, created.classId));
    expect(second?.locationId).toBe(first?.locationId);
    expect(second?.title).toBe("Pin class renamed");
    const kept = await db.select().from(schema.locations).where(eq(schema.locations.id, first!.locationId!));
    expect(kept).toHaveLength(1);
    const lat = kept[0]!.lat;
    const moved = await saveClass({ ...place, classId: created.classId, address: "200 Santa Monica Blvd", neighborhood: "Santa Monica", postalCode: "90401" });
    if ("error" in moved) throw new Error(moved.error);
    const [afterMove] = await db.select().from(schema.classes).where(eq(schema.classes.id, created.classId));
    expect(afterMove?.locationId).toBe(first?.locationId);
    const [location] = await db.select().from(schema.locations).where(eq(schema.locations.id, first!.locationId!));
    expect(location?.addressLine1).toBe("200 Santa Monica Blvd");
    expect(location?.lat).not.toBe(lat);
    const orphans = await db.select().from(schema.locations).where(eq(schema.locations.addressLine1, "100 Hollywood Blvd"));
    expect(orphans).toHaveLength(0);
    if (first?.locationId) {
      await db.update(schema.classes).set({ locationId: null }).where(eq(schema.classes.locationId, first.locationId));
      await db.delete(schema.locations).where(eq(schema.locations.id, first.locationId));
    }
  });

  it("does not attach sessions to a class the teacher does not own", async () => {
    const cat = await ensureCategory();
    const ownerA = await person("own-a");
    const ownerB = await person("own-b");
    const teacherA = await studio(ownerA, `${tag}-studio-a`);
    const teacherB = await studio(ownerB, `${tag}-studio-b`);
    const classId = crypto.randomUUID();
    await db.insert(schema.classes).values({
      id: classId, teacherId: teacherA, categoryId: cat, slug: `${tag}-foreign`, title: "Foreign", skillLevel: "all", format: "class", delivery: "virtual", maxSize: 8, durationMinutes: 60, pricePerSessionCents: 2500, status: "published",
    });
    const saved = await saveClass({
      actorUserId: ownerB,
      teacherId: teacherB,
      delegated: false,
      classId,
      title: "Hijack",
      description: "",
      outcomes: "",
      prerequisites: "",
      whatToBring: "",
      categoryId: cat,
      skillLevel: "all",
      format: "class",
      delivery: "virtual",
      virtualLink: "https://example.com/meet",
      maxSize: 8,
      durationMinutes: 60,
      pricePerSessionCents: 2500,
      pricePerSeriesCents: null,
      seriesBookingEnabled: false,
      firstClassFree: false,
      waitlistEnabled: false,
      publish: true,
      schedule: { mode: "once", date: "2027-11-02", time: "18:00" },
    });
    expect(saved).toEqual({ error: "Class not found." });
    const sessions = await db.select().from(schema.sessions).where(eq(schema.sessions.classId, classId));
    const rules = await db.select().from(schema.recurrences).where(eq(schema.recurrences.classId, classId));
    expect(sessions).toHaveLength(0);
    expect(rules).toHaveLength(0);
    const [klass] = await db.select().from(schema.classes).where(eq(schema.classes.id, classId));
    expect(klass?.title).toBe("Foreign");
    expect(klass?.teacherId).toBe(teacherA);
  });

  it("keeps a stale hold when Stripe cannot be reached", async () => {
    const cat = await ensureCategory();
    const owner = await person("outage-owner");
    const student = await person("outage-student");
    const teacherId = await studio(owner, `${tag}-outage`);
    const classId = crypto.randomUUID();
    await db.insert(schema.classes).values({
      id: classId, teacherId, categoryId: cat, slug: `${tag}-outage-class`, title: "Outage", skillLevel: "all", format: "class", delivery: "virtual", maxSize: 8, durationMinutes: 60, pricePerSessionCents: 2500, status: "published",
    });
    const sessionId = crypto.randomUUID();
    await db.insert(schema.sessions).values({
      id: sessionId, classId, startsAt: new Date("2027-12-01T18:00:00Z"), endsAt: new Date("2027-12-01T19:00:00Z"), localDate: "2027-12-01", capacity: 8,
    });
    const orderId = crypto.randomUUID();
    const bookingId = crypto.randomUUID();
    await db.insert(schema.orders).values({
      id: orderId, userId: student, teacherId, kind: "booking", status: "pending", studentPaysCents: 2500, paymentPath: "card", stripeCheckoutSessionId: `cs_outage_${tag}`, createdAt: new Date("2020-01-01T00:00:00Z"),
    });
    await db.insert(schema.bookings).values({ id: bookingId, orderId, userId: student, classId, kind: "session", status: "confirmed" });
    await db.insert(schema.bookingSessions).values({ id: crypto.randomUUID(), bookingId, sessionId });
    checkoutRetrieve.mockRejectedValue(new Error("stripe down"));
    const released = await releaseExpiredCheckoutHolds(new Date("2026-10-14T12:00:00Z"));
    expect(released).toBe(0);
    const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
    const [booking] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, bookingId));
    expect(order?.status).toBe("pending");
    expect(booking?.status).toBe("confirmed");
    checkoutRetrieve.mockResolvedValue({ status: "expired", payment_status: "unpaid" });
  });

  it("releases a stale hold when the Checkout session no longer exists", async () => {
    const cat = await ensureCategory();
    const owner = await person("gone-owner");
    const student = await person("gone-student");
    const teacherId = await studio(owner, `${tag}-gone`);
    const classId = crypto.randomUUID();
    await db.insert(schema.classes).values({
      id: classId, teacherId, categoryId: cat, slug: `${tag}-gone-class`, title: "Gone", skillLevel: "all", format: "class", delivery: "virtual", maxSize: 8, durationMinutes: 60, pricePerSessionCents: 2500, status: "published",
    });
    const sessionId = crypto.randomUUID();
    await db.insert(schema.sessions).values({
      id: sessionId, classId, startsAt: new Date("2027-12-02T18:00:00Z"), endsAt: new Date("2027-12-02T19:00:00Z"), localDate: "2027-12-02", capacity: 8,
    });
    const orderId = crypto.randomUUID();
    const bookingId = crypto.randomUUID();
    await db.insert(schema.orders).values({
      id: orderId, userId: student, teacherId, kind: "booking", status: "pending", studentPaysCents: 2500, paymentPath: "card", stripeCheckoutSessionId: `cs_gone_${tag}`, createdAt: new Date("2020-01-01T00:00:00Z"),
    });
    await db.insert(schema.bookings).values({ id: bookingId, orderId, userId: student, classId, kind: "session", status: "confirmed" });
    await db.insert(schema.bookingSessions).values({ id: crypto.randomUUID(), bookingId, sessionId });
    checkoutRetrieve.mockRejectedValue(Object.assign(new Error("No such checkout.session"), { code: "resource_missing", statusCode: 404 }));
    const released = await releaseExpiredCheckoutHolds(new Date("2026-10-14T12:00:00Z"));
    expect(released).toBeGreaterThanOrEqual(1);
    const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
    const [booking] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, bookingId));
    expect(order?.status).toBe("expired");
    expect(booking?.status).toBe("cancelled");
    checkoutRetrieve.mockResolvedValue({ status: "expired", payment_status: "unpaid" });
  });

  it("accepts a city promo for the class location and rejects it elsewhere", async () => {
    const cat = await ensureCategory();
    const owner = await person("city-owner");
    const student = await person("city-student");
    const teacherId = await studio(owner, `${tag}-city`);
    const locationId = crypto.randomUUID();
    await db.insert(schema.locations).values({
      id: locationId, name: "Beach room", addressLine1: "1 Ocean Ave", city: "Santa Monica", state: "CA", postalCode: "90401", neighborhood: "Santa Monica", lat: 34.01, lng: -118.49,
    });
    const classId = crypto.randomUUID();
    await db.insert(schema.classes).values({
      id: classId, teacherId, categoryId: cat, locationId, slug: `${tag}-city-class`, title: "Beach class", skillLevel: "all", format: "class", delivery: "in_person", maxSize: 8, durationMinutes: 60, pricePerSessionCents: 4000, status: "published",
    });
    const sessionId = crypto.randomUUID();
    await db.insert(schema.sessions).values({
      id: sessionId, classId, startsAt: new Date("2027-12-03T18:00:00Z"), endsAt: new Date("2027-12-03T19:00:00Z"), localDate: "2027-12-03", capacity: 8,
    });
    const code = `${tag}-SM`.toUpperCase();
    await db.insert(schema.promoCodes).values({
      id: crypto.randomUUID(), code, discountType: "percent", percentOffBps: 1000, appliesTo: "classes", cities: ["Santa Monica"], active: true,
    });
    const [studentRow] = await db.select().from(schema.user).where(eq(schema.user.id, student));
    const accepted = await bookSession({ userId: student, email: studentRow!.email, name: studentRow!.name, sessionId, code });
    expect(accepted.error).toMatch(/stripe down/);
    const [order] = await db.select().from(schema.orders).where(eq(schema.orders.userId, student));
    expect(order?.discountCents).toBeGreaterThan(0);
    expect(order?.promoCodeId).toBeTruthy();

    const otherLocation = crypto.randomUUID();
    await db.insert(schema.locations).values({
      id: otherLocation, name: "Hollywood room", addressLine1: "100 Hollywood Blvd", city: "Hollywood", state: "CA", postalCode: "90028", neighborhood: "Hollywood", lat: 34.09, lng: -118.32,
    });
    const otherClass = crypto.randomUUID();
    await db.insert(schema.classes).values({
      id: otherClass, teacherId, categoryId: cat, locationId: otherLocation, slug: `${tag}-city-other`, title: "Hills class", skillLevel: "all", format: "class", delivery: "in_person", maxSize: 8, durationMinutes: 60, pricePerSessionCents: 4000, status: "published",
    });
    const otherSession = crypto.randomUUID();
    await db.insert(schema.sessions).values({
      id: otherSession, classId: otherClass, startsAt: new Date("2027-12-04T18:00:00Z"), endsAt: new Date("2027-12-04T19:00:00Z"), localDate: "2027-12-04", capacity: 8,
    });
    const otherStudent = await person("city-other");
    const [otherRow] = await db.select().from(schema.user).where(eq(schema.user.id, otherStudent));
    const rejected = await bookSession({ userId: otherStudent, email: otherRow!.email, name: otherRow!.name, sessionId: otherSession, code });
    expect(rejected.error).toMatch(/doesn't apply in this city/);
    await db.update(schema.classes).set({ locationId: null }).where(inArray(schema.classes.locationId, [locationId, otherLocation]));
    await db.delete(schema.locations).where(inArray(schema.locations.id, [locationId, otherLocation]));
  });

  it("does not email a booking confirmation when cancelling a checkout that just paid", async () => {
    const cat = await ensureCategory();
    const owner = await person("mail-owner");
    const student = await person("mail-student");
    const teacherId = await studio(owner, `${tag}-mail`);
    const classId = crypto.randomUUID();
    await db.insert(schema.classes).values({
      id: classId, teacherId, categoryId: cat, slug: `${tag}-mail-class`, title: "Mail class", skillLevel: "all", format: "class", delivery: "virtual", maxSize: 8, durationMinutes: 60, pricePerSessionCents: 2500, status: "published",
    });
    const sessionId = crypto.randomUUID();
    await db.insert(schema.sessions).values({
      id: sessionId, classId, startsAt: new Date("2027-12-05T18:00:00Z"), endsAt: new Date("2027-12-05T19:00:00Z"), localDate: "2027-12-05", capacity: 8,
    });
    const orderId = crypto.randomUUID();
    const bookingId = crypto.randomUUID();
    const paymentIntent = `pi_mail_${tag}`;
    await db.insert(schema.orders).values({
      id: orderId, userId: student, teacherId, kind: "booking", status: "pending", studentPaysCents: 2500, paymentPath: "card", stripeCheckoutSessionId: `cs_mail_${tag}`,
    });
    await db.insert(schema.bookings).values({ id: bookingId, orderId, userId: student, classId, kind: "session", status: "confirmed" });
    await db.insert(schema.bookingSessions).values({ id: crypto.randomUUID(), bookingId, sessionId });
    checkoutRetrieve.mockResolvedValue({ status: "complete", payment_status: "paid", payment_intent: paymentIntent });
    vi.mocked(sendEmail).mockClear();
    refundCreate.mockClear();
    const cancelled = await cancelBooking(student, bookingId);
    expect(cancelled).toEqual({ ok: true });
    expect(refundCreate).toHaveBeenCalledWith({ payment_intent: paymentIntent });
    expect(sendEmail).not.toHaveBeenCalled();
    const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
    expect(order?.status).toBe("refunded");

    const paidId = crypto.randomUUID();
    const paidBooking = crypto.randomUUID();
    await db.insert(schema.orders).values({
      id: paidId, userId: student, teacherId, kind: "booking", status: "pending", studentPaysCents: 2500, paymentPath: "card",
    });
    await db.insert(schema.bookings).values({ id: paidBooking, orderId: paidId, userId: student, classId, kind: "session", status: "confirmed" });
    vi.mocked(sendEmail).mockClear();
    await fulfillPaidCheckout(paidId, `pi_ok_${tag}`, null);
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ subject: "You're booked: Mail class" }));
    checkoutRetrieve.mockResolvedValue({ status: "expired", payment_status: "unpaid" });
  });

  it("lets a studio upload class media and refuses a student or another studio", async () => {
    const cat = await ensureCategory();
    const owner = await person("upload-owner");
    const other = await person("upload-other");
    const student = await person("upload-student");
    const teacherId = await studio(owner, `${tag}-upload`);
    const otherTeacher = await studio(other, `${tag}-upload-other`);
    const classId = crypto.randomUUID();
    await db.insert(schema.classes).values({
      id: classId, teacherId, categoryId: cat, slug: `${tag}-upload-class`, title: "Upload", skillLevel: "all", format: "class", delivery: "virtual", maxSize: 8, durationMinutes: 60, pricePerSessionCents: 2500, status: "published",
    });
    expect(await mediaUploadAllowed({ id: student, roles: ["student"] }, { classId })).toEqual({ ok: false, status: 403, error: "You can't upload files for this studio." });
    expect(await mediaUploadAllowed({ id: other, roles: ["teacher"] }, { classId })).toEqual({ ok: false, status: 403, error: "You can't upload files for this studio." });
    expect(await mediaUploadAllowed({ id: owner, roles: ["teacher"] }, { classId })).toEqual({ ok: true });
    expect(await mediaUploadAllowed({ id: student, roles: ["admin"] }, { classId })).toEqual({ ok: true });
    expect(await mediaUploadAllowed({ id: owner, roles: ["teacher"] }, { teacherId })).toEqual({ ok: true });
    expect(await mediaUploadAllowed({ id: other, roles: ["teacher"] }, { classId, teacherId: otherTeacher })).toEqual({ ok: false, status: 403, error: "That class belongs to another studio." });
    expect(await mediaUploadAllowed({ id: owner, roles: ["teacher"] }, {})).toEqual({ ok: false, status: 403, error: "Choose a class to attach this file." });
  });
});
