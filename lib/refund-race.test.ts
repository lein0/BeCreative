import { config } from "dotenv";
import { afterAll, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";

config({ path: ".env.local" });

const { refundCreate } = vi.hoisted(() => ({
  refundCreate: vi.fn(async (params: { payment_intent?: string; amount?: number }, options?: { idempotencyKey?: string }) => {
    void params;
    void options;
    return { id: "re_test" };
  }),
}));

vi.mock("@/lib/stripe", async () => {
  const actual = await vi.importActual<typeof import("@/lib/stripe")>("@/lib/stripe");
  return {
    ...actual,
    getStripe: () => ({ refunds: { create: refundCreate } }),
  };
});

const { db } = await import("@/lib/db");
const schema = await import("@/lib/db/schema");
const { consumeRefundableCash, grantStudioCredit, issueRefund } = await import("@/lib/refunds");
const { refundOrderByPaymentIntent } = await import("@/lib/booking-service");
const { scheduleReminders } = await import("@/lib/worker");

const tag = `refund-${crypto.randomUUID().slice(0, 8)}`;
const userIds: string[] = [];
const teacherIds: string[] = [];
const orderIds: string[] = [];
let categoryId = "";

async function person(name: string) {
  const id = crypto.randomUUID();
  userIds.push(id);
  await db.insert(schema.user).values({ id, name, email: `${tag}-${name}@example.com`, emailVerified: true });
  return id;
}

async function studio(ownerId: string) {
  const id = crypto.randomUUID();
  teacherIds.push(id);
  await db.insert(schema.teachers).values({ id, userId: ownerId, slug: `${tag}-${id.slice(0, 6)}`, studioName: "Yoga Fit", status: "approved" });
  return id;
}

describe("refund cash and seats", () => {
  afterAll(async () => {
    if (orderIds.length) {
      await db.delete(schema.refundLedger).where(inArray(schema.refundLedger.orderId, orderIds));
      await db.delete(schema.bookings).where(inArray(schema.bookings.orderId, orderIds));
      await db.delete(schema.orders).where(inArray(schema.orders.id, orderIds));
    }
    if (teacherIds.length) {
      await db.delete(schema.studioCredits).where(inArray(schema.studioCredits.teacherId, teacherIds));
      await db.delete(schema.services).where(inArray(schema.services.teacherId, teacherIds));
      await db.delete(schema.teachers).where(inArray(schema.teachers.id, teacherIds));
    }
    if (userIds.length) await db.delete(schema.user).where(inArray(schema.user.id, userIds));
    if (categoryId) await db.delete(schema.categories).where(eq(schema.categories.id, categoryId));
  });

  it("does not refund cash that was already granted as studio credit", async () => {
    refundCreate.mockClear();
    const student = await person("credit");
    const teacherId = await studio(await person("credit-owner"));
    const orderId = crypto.randomUUID();
    orderIds.push(orderId);
    await db.insert(schema.orders).values({
      id: orderId,
      userId: student,
      teacherId,
      kind: "booking",
      status: "paid",
      listPriceCents: 5000,
      studentPaysCents: 5000,
      platformFeeCents: 500,
      teacherAmountCents: 4500,
      stripePaymentIntentId: `pi_${orderId}`,
    });
    const applied = await consumeRefundableCash(orderId, 5000);
    expect(applied).toBe(5000);
    await grantStudioCredit(student, teacherId, applied);
    const again = await issueRefund({ orderId, reasonCode: "admin_goodwill", scope: "admin:credit" });
    expect(again).toMatchObject({ error: "Nothing left to refund.", amountCents: 0 });
    expect(refundCreate).not.toHaveBeenCalled();
    const partialId = crypto.randomUUID();
    orderIds.push(partialId);
    await db.insert(schema.orders).values({
      id: partialId,
      userId: student,
      teacherId,
      kind: "booking",
      status: "paid",
      listPriceCents: 5000,
      studentPaysCents: 5000,
      platformFeeCents: 500,
      teacherAmountCents: 4500,
      stripePaymentIntentId: `pi_${partialId}`,
    });
    expect(await consumeRefundableCash(partialId, 2000)).toBe(2000);
    const rest = await issueRefund({ orderId: partialId, reasonCode: "admin_goodwill", scope: "admin:partial" });
    expect(rest).toMatchObject({ amountCents: 3000 });
    expect(refundCreate).toHaveBeenCalledWith(expect.objectContaining({ amount: 3000, payment_intent: `pi_${partialId}` }), expect.anything());
    const [saved] = await db.select().from(schema.orders).where(eq(schema.orders.id, partialId));
    expect(saved?.refundedCents).toBe(5000);
  });

  it("releases the seat when an admin refund lands before the webhook", async () => {
    refundCreate.mockClear();
    categoryId = categoryId || crypto.randomUUID();
    await db.insert(schema.categories).values({ id: categoryId, name: "Movement", slug: `${tag}-move` }).onConflictDoNothing();
    const student = await person("seat");
    const teacherId = await studio(await person("seat-owner"));
    const classId = crypto.randomUUID();
    await db.insert(schema.classes).values({
      id: classId,
      teacherId,
      categoryId,
      slug: `${tag}-class`,
      title: "Floor",
      skillLevel: "all",
      format: "class",
      delivery: "in_person",
      maxSize: 8,
      durationMinutes: 60,
      pricePerSessionCents: 4000,
      status: "published",
    });
    const orderId = crypto.randomUUID();
    orderIds.push(orderId);
    const bookingId = crypto.randomUUID();
    await db.insert(schema.orders).values({
      id: orderId,
      userId: student,
      teacherId,
      kind: "booking",
      status: "paid",
      listPriceCents: 4000,
      studentPaysCents: 4000,
      platformFeeCents: 400,
      teacherAmountCents: 3600,
      stripePaymentIntentId: `pi_${orderId}`,
    });
    await db.insert(schema.bookings).values({ id: bookingId, orderId, userId: student, classId, kind: "session", status: "confirmed" });
    const issued = await issueRefund({ orderId, reasonCode: "admin_goodwill", scope: "admin:seat" });
    expect(issued).toMatchObject({ amountCents: 4000, full: true });
    const [booking] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, bookingId));
    expect(booking?.status).toBe("cancelled");
  });

  it("records refunded cents and still releases a seat if the order is already refunded", async () => {
    categoryId = categoryId || crypto.randomUUID();
    await db.insert(schema.categories).values({ id: categoryId, name: "Movement", slug: `${tag}-move` }).onConflictDoNothing();
    const student = await person("hook");
    const teacherId = await studio(await person("hook-owner"));
    const classId = crypto.randomUUID();
    await db.insert(schema.classes).values({
      id: classId,
      teacherId,
      categoryId,
      slug: `${tag}-hook`,
      title: "Hook",
      skillLevel: "all",
      format: "class",
      delivery: "in_person",
      maxSize: 8,
      durationMinutes: 60,
      pricePerSessionCents: 4000,
      status: "published",
    });
    const orderId = crypto.randomUUID();
    orderIds.push(orderId);
    const bookingId = crypto.randomUUID();
    const intent = `pi_${orderId}`;
    await db.insert(schema.orders).values({
      id: orderId,
      userId: student,
      teacherId,
      kind: "booking",
      status: "refunded",
      listPriceCents: 4000,
      studentPaysCents: 4000,
      refundedCents: 0,
      platformFeeCents: 400,
      teacherAmountCents: 3600,
      stripePaymentIntentId: intent,
    });
    await db.insert(schema.bookings).values({ id: bookingId, orderId, userId: student, classId, kind: "session", status: "confirmed" });
    await refundOrderByPaymentIntent(intent, true);
    const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
    const [booking] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, bookingId));
    expect(order?.refundedCents).toBe(4000);
    expect(booking?.status).toBe("cancelled");
  });

  it("queues a reminder for a visit inside the window", async () => {
    categoryId = categoryId || crypto.randomUUID();
    await db.insert(schema.categories).values({ id: categoryId, name: "Movement", slug: `${tag}-move` }).onConflictDoNothing();
    const student = await person("visit");
    const teacherId = await studio(await person("visit-owner"));
    const serviceId = crypto.randomUUID();
    await db.insert(schema.services).values({
      id: serviceId,
      teacherId,
      categoryId,
      slug: `${tag}-sauna`,
      title: "Sauna",
      kind: "access",
      status: "published",
    });
    const visitId = crypto.randomUUID();
    const startsAt = new Date(Date.now() + 24 * 3_600_000);
    await db.insert(schema.visitBookings).values({
      id: visitId,
      userId: student,
      serviceId,
      offeringKind: "access",
      startsAt,
      endsAt: new Date(startsAt.getTime() + 30 * 60_000),
      status: "confirmed",
    });
    await scheduleReminders(new Date());
    const key = `reminder:visit:${visitId}:${student}:24`;
    const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.idempotencyKey, key));
    expect(job?.kind).toBe("reminder.send");
    await db.delete(schema.jobs).where(eq(schema.jobs.idempotencyKey, key));
  });
});
