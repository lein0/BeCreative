import { config } from "dotenv";
import { afterAll, describe, expect, it, vi } from "vitest";

config({ path: ".env.local" });

const { refundCreate } = vi.hoisted(() => ({
  refundCreate: vi.fn(async (_params: { payment_intent?: string; amount?: number }, _options?: { idempotencyKey?: string }) => ({ id: "re_test" })),
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
    getStripe: () => ({ refunds: { create: refundCreate } }),
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
const { bookSession, cancelBooking, confirmedCount } = await import("@/lib/booking-service");
const { sendIndividually } = await import("@/lib/email");
const { teacherProfile } = await import("@/lib/queries");
const { manualBook, setPaused, syncRule } = await import("@/lib/studio-service");

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
  await db.insert(schema.teachers).values({ id, userId: ownerId, slug, studioName: slug, status, bio: "", stripeChargesEnabled: true });
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
    const bookedSession = before.find((session) => session.localDate >= "2026-10-08");
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
    const sheet = await bookSession({ userId: student, email: studentRow!.email, name: studentRow!.name, sessionId, paymentSheet: true });
    expect(sheet.error).toBe("stripe down");
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
    expect(result.ok).toBe(true);
    expect(refundCreate).toHaveBeenCalled();
    expect(refundCreate.mock.calls[0]?.[0]).toMatchObject({ payment_intent: `pi_${tag}`, amount: 4000 });
    const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
    expect(order?.status).toBe("paid");
    expect(order?.refundedCents).toBe(4000);
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
});
