import { config } from "dotenv";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

config({ path: ".env.local" });

const stripe = vi.hoisted(() => ({
  configured: false,
  fail: false,
}));

vi.mock("@/lib/stripe", async () => {
  const actual = await vi.importActual<typeof import("@/lib/stripe")>("@/lib/stripe");
  return {
    ...actual,
    stripeConfigured: () => stripe.configured,
    createCheckout: vi.fn(async () => {
      if (stripe.fail) throw new Error("stripe down");
      return { id: "cs_test", url: "https://checkout.example/session" };
    }),
  };
});

vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(async () => ({ id: "email", ok: true as const })),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));

const { eq, inArray } = await import("drizzle-orm");
const { db } = await import("@/lib/db");
const schema = await import("@/lib/db/schema");
const { sendEmail } = await import("@/lib/email");
const { fulfillPaidCheckout } = await import("@/lib/booking-service");
const { bookVisit, openSlotsForService } = await import("@/lib/wellness-service");

const tag = `bug-${crypto.randomUUID().slice(0, 8)}`;
const ids: { teacher?: string; users: string[]; category?: string } = { users: [] };

async function person(name: string) {
  const id = crypto.randomUUID();
  ids.users.push(id);
  await db.insert(schema.user).values({
    id,
    name,
    email: `${tag}-${name}@example.com`,
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return id;
}

async function appointment(title: string, teacherId: string, categoryId: string) {
  const serviceId = crypto.randomUUID();
  await db.insert(schema.services).values({
    id: serviceId,
    teacherId,
    categoryId,
    slug: `${tag}-${title}`,
    title,
    kind: "appointment",
    bufferMinutes: 0,
    leadTimeHours: 0,
    cancellationHours: 24,
    status: "published",
  });
  const optionId = crypto.randomUUID();
  await db.insert(schema.serviceOptions).values({ id: optionId, serviceId, label: "60 min", minutes: 60, priceCents: 9000, sortOrder: 0 });
  for (let weekday = 0; weekday < 7; weekday += 1) {
    await db.insert(schema.availabilityWindows).values({ id: crypto.randomUUID(), serviceId, weekday, startTime: "00:00", endTime: "23:00" });
  }
  return { serviceId, optionId };
}

describe("wellness bugbot regressions", () => {
  afterAll(async () => {
    if (ids.users.length) await db.delete(schema.orders).where(inArray(schema.orders.userId, ids.users));
    if (ids.teacher) await db.delete(schema.teachers).where(eq(schema.teachers.id, ids.teacher));
    if (ids.users.length) await db.delete(schema.user).where(inArray(schema.user.id, ids.users));
    if (ids.category) await db.delete(schema.categories).where(eq(schema.categories.id, ids.category));
  });

  beforeEach(async () => {
    stripe.configured = false;
    stripe.fail = false;
    vi.mocked(sendEmail).mockClear();
    if (!ids.teacher) return;
    const owned = await db.select({ id: schema.services.id }).from(schema.services).where(eq(schema.services.teacherId, ids.teacher));
    if (owned.length) {
      await db.update(schema.visitBookings).set({ status: "cancelled" }).where(inArray(schema.visitBookings.serviceId, owned.map((row) => row.id)));
    }
  });

  it("blocks a required waiver when the studio has not published one", async () => {
    await db.insert(schema.platformSettings).values({ id: 1, feePercent: 10, feeFixedCents: 0 }).onConflictDoNothing();
    const categoryId = crypto.randomUUID();
    ids.category = categoryId;
    await db.insert(schema.categories).values({ id: categoryId, name: "Bug yoga", slug: `${tag}-yoga`, vertical: "wellness" });
    const owner = await person("owner");
    const teacherId = crypto.randomUUID();
    ids.teacher = teacherId;
    await db.insert(schema.teachers).values({ id: teacherId, userId: owner, slug: `${tag}-studio`, studioName: "Bug Studio", status: "approved", bio: "" });
    const { serviceId, optionId } = await appointment("Massage", teacherId, categoryId);
    await db.update(schema.services).set({ waiverRequired: true }).where(eq(schema.services.id, serviceId));
    const open = await openSlotsForService(serviceId, new Date(), 2);
    if (open.kind !== "appointment") throw new Error("expected an appointment");
    const startsAt = open.options[0]!.slots[0]!.startsAt.toISOString();
    const student = await person("waiver");
    const blocked = await bookVisit({ userId: student, email: "waiver@example.com", serviceId, optionId, startsAt });
    expect(blocked).toEqual({ error: "This studio requires a waiver before booking." });
  });

  it("releases a confirmed visit when checkout throws", async () => {
    stripe.configured = true;
    stripe.fail = true;
    await db.update(schema.teachers).set({ stripeChargesEnabled: true }).where(eq(schema.teachers.id, ids.teacher!));
    const { serviceId, optionId } = await appointment("Checkout", ids.teacher!, ids.category!);
    const open = await openSlotsForService(serviceId, new Date(), 2);
    if (open.kind !== "appointment") throw new Error("expected an appointment");
    const startsAt = open.options[0]!.slots[0]!.startsAt.toISOString();
    const student = await person("held");
    const failed = await bookVisit({ userId: student, email: "held@example.com", serviceId, optionId, startsAt });
    expect(failed).toEqual({ error: "stripe down" });
    const visits = await db.select().from(schema.visitBookings).where(eq(schema.visitBookings.userId, student));
    expect(visits).toHaveLength(1);
    expect(visits[0]?.status).toBe("cancelled");
    const [order] = await db.select().from(schema.orders).where(eq(schema.orders.userId, student));
    expect(order?.status).toBe("cancelled");
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("refuses overlapping private hours on two services from one practitioner", async () => {
    const teacherId = ids.teacher!;
    const categoryId = ids.category!;
    const massage = await appointment("Massage-b", teacherId, categoryId);
    const reiki = await appointment("Reiki", teacherId, categoryId);
    const open = await openSlotsForService(massage.serviceId, new Date(), 2);
    if (open.kind !== "appointment") throw new Error("expected an appointment");
    const slot = open.options[0]!.slots[0]!;
    const firstStudent = await person("first");
    const booked = await bookVisit({
      userId: firstStudent,
      email: "first@example.com",
      serviceId: massage.serviceId,
      optionId: massage.optionId,
      startsAt: slot.startsAt.toISOString(),
    });
    expect(booked).toHaveProperty("orderId");
    const reikiOpen = await openSlotsForService(reiki.serviceId, new Date(), 2);
    if (reikiOpen.kind !== "appointment") throw new Error("expected an appointment");
    expect(reikiOpen.options[0]!.slots.some((item) => item.startsAt.getTime() === slot.startsAt.getTime())).toBe(false);
    const overlap = await bookVisit({
      userId: await person("second"),
      email: "second@example.com",
      serviceId: reiki.serviceId,
      optionId: reiki.optionId,
      startsAt: slot.startsAt.toISOString(),
    });
    expect(overlap).toMatchObject({ error: "That time is not open." });
    const later = open.options[0]!.slots.find((item) => item.startsAt.getTime() >= slot.startsAt.getTime() + 2 * 3_600_000);
    expect(later).toBeTruthy();
    const [left, right] = await Promise.all([
      bookVisit({ userId: await person("race-a"), email: "a@example.com", serviceId: massage.serviceId, optionId: massage.optionId, startsAt: later!.startsAt.toISOString() }),
      bookVisit({ userId: await person("race-b"), email: "b@example.com", serviceId: reiki.serviceId, optionId: reiki.optionId, startsAt: later!.startsAt.toISOString() }),
    ]);
    const results = [left, right];
    expect(results.filter((result) => "orderId" in result && result.orderId).length).toBe(1);
    expect(results.some((result) => "error" in result && /taken|not open/i.test(result.error ?? ""))).toBe(true);
  });

  it("rejects add-on minutes that run past close", async () => {
    const { serviceId, optionId } = await appointment("Stones", ids.teacher!, ids.category!);
    const addonId = crypto.randomUUID();
    await db.insert(schema.serviceAddons).values({ id: addonId, serviceId, name: "Hot stones", priceCents: 2500, minutes: 30 });
    const open = await openSlotsForService(serviceId, new Date(), 3);
    if (open.kind !== "appointment") throw new Error("expected an appointment");
    const tight = open.options[0]!.slots.find((slot) => slot.slackMinutes === 0);
    const roomy = open.options[0]!.slots.find((slot) => slot.slackMinutes >= 30);
    expect(tight).toBeTruthy();
    expect(roomy).toBeTruthy();
    const student = await person("addon");
    const pastClose = await bookVisit({
      userId: student,
      email: "addon@example.com",
      serviceId,
      optionId,
      addonIds: [addonId],
      startsAt: tight!.startsAt.toISOString(),
    });
    expect(pastClose).toEqual({ error: "That time is not open." });
    const booked = await bookVisit({
      userId: student,
      email: "addon@example.com",
      serviceId,
      optionId,
      addonIds: [addonId],
      startsAt: roomy!.startsAt.toISOString(),
    });
    expect(booked).toHaveProperty("orderId");
    const orderId = "orderId" in booked ? booked.orderId : "";
    const [visit] = await db.select().from(schema.visitBookings).where(eq(schema.visitBookings.orderId, orderId!));
    expect(visit?.endsAt.getTime() - visit!.startsAt.getTime()).toBe(90 * 60_000);
  });

  it("keeps class-only codes off visits and treats first-time as teacher bookings", async () => {
    const teacherId = ids.teacher!;
    const { serviceId, optionId } = await appointment("Promo", teacherId, ids.category!);
    const firstCode = `${tag}-first`.toUpperCase();
    const classCode = `${tag}-class`.toUpperCase();
    await db.insert(schema.promoCodes).values([
      { id: crypto.randomUUID(), teacherId, code: firstCode, discountType: "percent", percentOffBps: 1000, appliesTo: "classes", firstTimeOnly: true, funding: "teacher" },
      { id: crypto.randomUUID(), teacherId, code: classCode, discountType: "percent", percentOffBps: 1000, appliesTo: "classes", classIds: ["scene-study"], funding: "teacher" },
    ]);
    const open = await openSlotsForService(serviceId, new Date(), 3);
    if (open.kind !== "appointment") throw new Error("expected an appointment");
    const slots = open.options[0]!.slots;
    const newbie = await person("newbie");
    await db.insert(schema.orders).values({
      id: crypto.randomUUID(),
      userId: newbie,
      teacherId,
      kind: "pack",
      status: "paid",
      listPriceCents: 5000,
      studentPaysCents: 5000,
    });
    const discounted = await bookVisit({
      userId: newbie,
      email: "newbie@example.com",
      serviceId,
      optionId,
      startsAt: slots[0]!.startsAt.toISOString(),
      code: firstCode,
    });
    expect(discounted).toHaveProperty("orderId");
    const newbieOrderId = "orderId" in discounted ? discounted.orderId : "";
    const [newbieOrder] = await db.select().from(schema.orders).where(eq(schema.orders.id, newbieOrderId!));
    expect(newbieOrder?.discountCents).toBe(900);
    const returning = await person("returning");
    await bookVisit({
      userId: returning,
      email: "returning@example.com",
      serviceId,
      optionId,
      startsAt: slots[2]!.startsAt.toISOString(),
    });
    const again = await bookVisit({
      userId: returning,
      email: "returning@example.com",
      serviceId,
      optionId,
      startsAt: slots[4]!.startsAt.toISOString(),
      code: firstCode,
    });
    expect(again).toMatchObject({ error: "This code is for first-time students." });
    const limited = await bookVisit({
      userId: await person("limited"),
      email: "limited@example.com",
      serviceId,
      optionId,
      startsAt: slots[6]!.startsAt.toISOString(),
      code: classCode,
    });
    expect(limited).toMatchObject({ error: "This code doesn't apply to this class." });
  });

  it("emails pay-at-studio visits and paid card visits", async () => {
    const { serviceId, optionId } = await appointment("Email", ids.teacher!, ids.category!);
    const open = await openSlotsForService(serviceId, new Date(), 2);
    if (open.kind !== "appointment") throw new Error("expected an appointment");
    const student = await person("mail");
    const booked = await bookVisit({
      userId: student,
      email: `${tag}-mail@example.com`,
      serviceId,
      optionId,
      startsAt: open.options[0]!.slots[0]!.startsAt.toISOString(),
    });
    expect(booked).toHaveProperty("orderId");
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: [`${tag}-mail@example.com`],
      subject: "You're booked: Email",
      text: "Your spot is reserved. Pay the teacher at the studio.",
    }));
    vi.mocked(sendEmail).mockClear();
    const orderId = crypto.randomUUID();
    const visitId = crypto.randomUUID();
    const cardStudent = await person("card");
    await db.insert(schema.orders).values({
      id: orderId,
      userId: cardStudent,
      teacherId: ids.teacher,
      kind: "visit",
      status: "pending",
      listPriceCents: 9000,
      studentPaysCents: 9000,
    });
    await db.insert(schema.visitBookings).values({
      id: visitId,
      orderId,
      userId: cardStudent,
      serviceId,
      optionId,
      offeringKind: "appointment",
      startsAt: open.options[0]!.slots[3]!.startsAt,
      endsAt: open.options[0]!.slots[3]!.endsAt,
    });
    await fulfillPaidCheckout(orderId, "pi_test", null);
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: [`${tag}-card@example.com`],
      subject: "You're booked: Email",
      text: "Your spot is reserved.",
    }));
  });
});
