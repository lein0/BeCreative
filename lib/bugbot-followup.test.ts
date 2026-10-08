import { config } from "dotenv";
import { afterAll, describe, expect, it, vi } from "vitest";

config({ path: ".env.local" });

vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(async () => ({ id: "email" })),
  sendIndividually: vi.fn(async () => ({ id: "batch" })),
}));

vi.mock("@/lib/stripe", async () => {
  const actual = await vi.importActual<typeof import("@/lib/stripe")>("@/lib/stripe");
  return {
    ...actual,
    stripeConfigured: () => true,
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
const { db } = await import("@/lib/db");
const schema = await import("@/lib/db/schema");
const { bookSession } = await import("@/lib/booking-service");
const { sendIndividually } = await import("@/lib/email");
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

async function studio(ownerId: string, slug: string) {
  const id = crypto.randomUUID();
  teacherIds.push(id);
  await db.insert(schema.teachers).values({ id, userId: ownerId, slug, studioName: slug, status: "approved", bio: "", stripeChargesEnabled: true });
  return id;
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
    const held = await db.select().from(schema.bookings).where(eq(schema.bookings.userId, student));
    expect(held.every((booking) => booking.status === "cancelled")).toBe(true);
    expect(held.some((booking) => booking.status === "confirmed")).toBe(false);
    const orderIds = held.map((booking) => booking.orderId).filter((id): id is string => Boolean(id));
    const orderRows = orderIds.length ? await db.select().from(schema.orders).where(inArray(schema.orders.id, orderIds)) : [];
    expect(orderRows.every((order) => order.status === "cancelled")).toBe(true);
  });
});
