import { config } from "dotenv";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

config({ path: ".env.local" });

const stripe = vi.hoisted(() => ({
  configured: false,
  fail: false,
  client: false,
  retrieve: vi.fn(async (): Promise<{ status: string; payment_status: string; payment_intent: string | null }> => ({
    status: "expired",
    payment_status: "unpaid",
    payment_intent: null,
  })),
  expire: vi.fn(async () => ({})),
  refund: vi.fn(async () => ({ id: "re_test" })),
}));

vi.mock("@/lib/stripe", async () => {
  const actual = await vi.importActual<typeof import("@/lib/stripe")>("@/lib/stripe");
  return {
    ...actual,
    stripeConfigured: () => stripe.configured,
    getStripe: () =>
      stripe.client
        ? {
            refunds: { create: stripe.refund },
            checkout: { sessions: { retrieve: stripe.retrieve, expire: stripe.expire } },
          }
        : null,
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
const { db, pool } = await import("@/lib/db");
const schema = await import("@/lib/db/schema");
const { sendEmail } = await import("@/lib/email");
const { bookSession, fulfillPaidCheckout, releaseVisitSeat } = await import("@/lib/booking-service");
const { bookVisit, cancelVisit, openSlotsForService, rosterWaiver, signWaiver } = await import("@/lib/wellness-service");

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
    stripe.client = false;
    stripe.retrieve.mockReset();
    stripe.retrieve.mockResolvedValue({ status: "expired", payment_status: "unpaid", payment_intent: null });
    stripe.expire.mockReset();
    stripe.refund.mockReset();
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

  it("refuses a second booking of the same shared slot", async () => {
    const serviceId = crypto.randomUUID();
    await db.insert(schema.services).values({
      id: serviceId, teacherId: ids.teacher!, categoryId: ids.category!, slug: `${tag}-sauna`, title: "Sauna", kind: "access", slotMinutes: 30, capacity: 4, priceCents: 0, leadTimeHours: 0, status: "published",
    });
    for (let weekday = 0; weekday < 7; weekday += 1) {
      await db.insert(schema.availabilityWindows).values({ id: crypto.randomUUID(), serviceId, weekday, startTime: "00:00", endTime: "23:00" });
    }
    const open = await openSlotsForService(serviceId, new Date(), 2);
    if (open.kind !== "access") throw new Error("expected access");
    const startsAt = open.slots[0]!.startsAt.toISOString();
    const student = await person("twice");
    const first = await bookVisit({ userId: student, email: "twice@example.com", serviceId, startsAt });
    expect(first).toHaveProperty("orderId");
    const second = await bookVisit({ userId: student, email: "twice@example.com", serviceId, startsAt });
    expect(second).toEqual({ error: "You already have this time." });
  });

  it("hides private hours that overlap a group class", async () => {
    const { serviceId, optionId } = await appointment("Overlap", ids.teacher!, ids.category!);
    const open = await openSlotsForService(serviceId, new Date(), 2);
    if (open.kind !== "appointment") throw new Error("expected an appointment");
    const slot = open.options[0]!.slots[2]!;
    const classId = crypto.randomUUID();
    await db.insert(schema.classes).values({
      id: classId, teacherId: ids.teacher!, categoryId: ids.category!, slug: `${tag}-group`, title: "Group", skillLevel: "all", format: "class", delivery: "in_person", maxSize: 10, durationMinutes: 60, pricePerSessionCents: 2000, status: "published",
    });
    await db.insert(schema.sessions).values({
      id: crypto.randomUUID(), classId, startsAt: slot.startsAt, endsAt: slot.endsAt, localDate: slot.localDate, capacity: 10, status: "scheduled",
    });
    const again = await openSlotsForService(serviceId, new Date(), 2);
    if (again.kind !== "appointment") throw new Error("expected an appointment");
    expect(again.options[0]!.slots.some((item) => item.startsAt.getTime() === slot.startsAt.getTime())).toBe(false);
    const booked = await bookVisit({
      userId: await person("overlap"),
      email: "overlap@example.com",
      serviceId,
      optionId,
      startsAt: slot.startsAt.toISOString(),
    });
    expect(booked).toMatchObject({ error: "That time is not open." });
  });

  it("refuses a class seat that overlaps a confirmed private visit", async () => {
    const { serviceId, optionId } = await appointment("Class clash", ids.teacher!, ids.category!);
    const open = await openSlotsForService(serviceId, new Date(), 2);
    if (open.kind !== "appointment") throw new Error("expected an appointment");
    const slot = open.options[0]!.slots[2]!;
    const later = open.options[0]!.slots.find((item) => item.startsAt.getTime() >= slot.endsAt.getTime() + 60 * 60_000);
    expect(later).toBeTruthy();
    const visit = await bookVisit({
      userId: await person("visitor"),
      email: "visitor@example.com",
      serviceId,
      optionId,
      startsAt: slot.startsAt.toISOString(),
    });
    expect(visit).toHaveProperty("orderId");
    const classId = crypto.randomUUID();
    await db.insert(schema.classes).values({
      id: classId, teacherId: ids.teacher!, categoryId: ids.category!, slug: `${tag}-clash`, title: "Clash", skillLevel: "all", format: "class", delivery: "in_person", maxSize: 10, durationMinutes: 60, pricePerSessionCents: 2000, status: "published",
    });
    const sessionId = crypto.randomUUID();
    const laterId = crypto.randomUUID();
    await db.insert(schema.sessions).values([
      { id: sessionId, classId, startsAt: slot.startsAt, endsAt: slot.endsAt, localDate: slot.localDate, capacity: 10, status: "scheduled" },
      { id: laterId, classId, startsAt: later!.startsAt, endsAt: later!.endsAt, localDate: later!.localDate, capacity: 10, status: "scheduled" },
    ]);
    const student = await person("class-seat");
    const blocked = await bookSession({ userId: student, email: "class-seat@example.com", name: "Class Seat", sessionId });
    expect(blocked).toEqual({ error: "That time overlaps a private appointment." });
    const openSeat = await bookSession({ userId: student, email: "class-seat@example.com", name: "Class Seat", sessionId: laterId });
    expect(openSeat).toHaveProperty("orderId");
  });

  it("does not let two visits spend the same pack credit", async () => {
    const serviceId = crypto.randomUUID();
    await db.insert(schema.services).values({
      id: serviceId, teacherId: ids.teacher!, categoryId: ids.category!, slug: `${tag}-credit`, title: "Credit sauna", kind: "access", slotMinutes: 30, capacity: 4, priceCents: 2000, leadTimeHours: 0, status: "published",
    });
    for (let weekday = 0; weekday < 7; weekday += 1) {
      await db.insert(schema.availabilityWindows).values({ id: crypto.randomUUID(), serviceId, weekday, startTime: "00:00", endTime: "23:00" });
    }
    const packId = crypto.randomUUID();
    await db.insert(schema.packs).values({ id: packId, teacherId: ids.teacher!, slug: `${tag}-one`, name: "One", creditCount: 1, priceCents: 1000 });
    const student = await person("credit");
    const purchaseId = crypto.randomUUID();
    await db.insert(schema.packPurchases).values({
      id: purchaseId, userId: student, packId, teacherId: ids.teacher!, creditsTotal: 1, creditsRemaining: 1,
    });
    const open = await openSlotsForService(serviceId, new Date(), 2);
    if (open.kind !== "access") throw new Error("expected access");
    const [first, second] = await Promise.all([
      bookVisit({ userId: student, email: "credit@example.com", serviceId, startsAt: open.slots[0]!.startsAt.toISOString(), payWith: `pack:${purchaseId}` }),
      bookVisit({ userId: student, email: "credit@example.com", serviceId, startsAt: open.slots[1]!.startsAt.toISOString(), payWith: `pack:${purchaseId}` }),
    ]);
    const results = [first, second];
    expect(results.filter((result) => "orderId" in result && result.orderId)).toHaveLength(1);
    expect(results.some((result) => "error" in result && /credit/i.test(result.error ?? ""))).toBe(true);
    const [purchase] = await db.select().from(schema.packPurchases).where(eq(schema.packPurchases.id, purchaseId));
    expect(purchase?.creditsRemaining).toBe(0);
  });

  it("expires an open checkout session when a pending visit is cancelled", async () => {
    stripe.client = true;
    stripe.retrieve.mockResolvedValue({ status: "open", payment_status: "unpaid", payment_intent: null });
    const { serviceId, optionId } = await appointment("Cancel open", ids.teacher!, ids.category!);
    const student = await person("cancel-open");
    const orderId = crypto.randomUUID();
    const visitId = crypto.randomUUID();
    const startsAt = new Date(Date.now() + 7 * 86_400_000);
    await db.insert(schema.orders).values({
      id: orderId,
      userId: student,
      teacherId: ids.teacher,
      kind: "visit",
      status: "pending",
      listPriceCents: 9000,
      studentPaysCents: 9000,
      paymentPath: "card",
      stripeCheckoutSessionId: "cs_open",
    });
    await db.insert(schema.visitBookings).values({
      id: visitId,
      orderId,
      userId: student,
      serviceId,
      optionId,
      offeringKind: "appointment",
      startsAt,
      endsAt: new Date(startsAt.getTime() + 60 * 60_000),
    });
    const result = await cancelVisit(student, visitId);
    expect(result).toEqual({ ok: true });
    expect(stripe.expire).toHaveBeenCalledWith("cs_open");
    expect(stripe.refund).not.toHaveBeenCalled();
    const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
    const [visit] = await db.select().from(schema.visitBookings).where(eq(schema.visitBookings.id, visitId));
    expect(order?.status).toBe("cancelled");
    expect(visit?.status).toBe("cancelled");
  });

  it("refunds a checkout that already completed when the visit is cancelled", async () => {
    stripe.client = true;
    stripe.retrieve.mockResolvedValue({ status: "complete", payment_status: "paid", payment_intent: "pi_123" });
    const { serviceId, optionId } = await appointment("Cancel paid", ids.teacher!, ids.category!);
    const student = await person("cancel-paid");
    const orderId = crypto.randomUUID();
    const visitId = crypto.randomUUID();
    const startsAt = new Date(Date.now() + 7 * 86_400_000);
    await db.insert(schema.orders).values({
      id: orderId,
      userId: student,
      teacherId: ids.teacher,
      kind: "visit",
      status: "pending",
      listPriceCents: 9000,
      studentPaysCents: 9000,
      paymentPath: "card",
      stripeCheckoutSessionId: "cs_paid",
    });
    await db.insert(schema.visitBookings).values({
      id: visitId,
      orderId,
      userId: student,
      serviceId,
      optionId,
      offeringKind: "appointment",
      startsAt,
      endsAt: new Date(startsAt.getTime() + 60 * 60_000),
    });
    vi.mocked(sendEmail).mockClear();
    const result = await cancelVisit(student, visitId);
    expect(result).toEqual({ ok: true });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(stripe.expire).not.toHaveBeenCalled();
    expect(stripe.refund).toHaveBeenCalledWith({ payment_intent: "pi_123" });
    const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
    const [visit] = await db.select().from(schema.visitBookings).where(eq(schema.visitBookings.id, visitId));
    expect(order?.status).toBe("refunded");
    expect(visit?.status).toBe("cancelled");
  });

  it("lets only one visit redeem a limited code", async () => {
    const otherOwner = await person("promo-owner");
    const otherTeacher = crypto.randomUUID();
    await db.insert(schema.teachers).values({
      id: otherTeacher,
      userId: otherOwner,
      slug: `${tag}-other`,
      studioName: "Other Studio",
      status: "approved",
      bio: "",
    });
    const first = await appointment("Promo A", ids.teacher!, ids.category!);
    const second = await appointment("Promo B", otherTeacher, ids.category!);
    const code = `${tag}-ONCE`.toUpperCase();
    await db.insert(schema.promoCodes).values({
      id: crypto.randomUUID(),
      code,
      discountType: "amount",
      amountOffCents: 100,
      appliesTo: "all",
      active: true,
      maxRedemptions: 1,
    });
    const openA = await openSlotsForService(first.serviceId, new Date(), 2);
    const openB = await openSlotsForService(second.serviceId, new Date(), 2);
    if (openA.kind !== "appointment" || openB.kind !== "appointment") throw new Error("expected appointments");
    const studentA = await person("promo-a");
    const studentB = await person("promo-b");
    const [a, b] = await Promise.all([
      bookVisit({
        userId: studentA,
        email: "promo-a@example.com",
        serviceId: first.serviceId,
        optionId: first.optionId,
        startsAt: openA.options[0]!.slots[0]!.startsAt.toISOString(),
        code,
      }),
      bookVisit({
        userId: studentB,
        email: "promo-b@example.com",
        serviceId: second.serviceId,
        optionId: second.optionId,
        startsAt: openB.options[0]!.slots[0]!.startsAt.toISOString(),
        code,
      }),
    ]);
    const results = [a, b];
    expect(results.filter((result) => "orderId" in result && result.orderId)).toHaveLength(1);
    expect(results.some((result) => "error" in result && /redemption limit/i.test(result.error ?? ""))).toBe(true);
    const redemptions = await db
      .select()
      .from(schema.promoRedemptions)
      .where(inArray(schema.promoRedemptions.userId, [studentA, studentB]));
    expect(redemptions.filter((row) => !row.reversed)).toHaveLength(1);
  });

  it("shows the waiver signed at booking, not a later signature", () => {
    const student = "student-1";
    const bookedAt = new Date("2026-10-01T12:00:00Z");
    const earlier = {
      id: "sig-v1",
      userId: student,
      version: 1,
      signedAt: new Date("2026-09-01T12:00:00Z"),
    };
    const later = {
      id: "sig-v2",
      userId: student,
      version: 2,
      signedAt: new Date("2026-10-10T12:00:00Z"),
    };
    const visit = { waiverSignatureId: null as string | null, userId: student, createdAt: bookedAt };
    expect(rosterWaiver(visit, [later, earlier])?.id).toBe("sig-v1");
    expect(rosterWaiver({ ...visit, waiverSignatureId: "sig-v1" }, [later, earlier])?.version).toBe(1);
    expect(rosterWaiver({ ...visit, createdAt: new Date("2026-08-01T12:00:00Z") }, [later, earlier])).toBeNull();
    expect(rosterWaiver({ ...visit, waiverSignatureId: "missing" }, [later, earlier])).toBeNull();
  });

  it("does not refund a visit order that a webhook already refunded", async () => {
    stripe.client = true;
    const { serviceId, optionId } = await appointment("Refund race", ids.teacher!, ids.category!);
    const student = await person("refund-race");
    const orderId = crypto.randomUUID();
    const visitId = crypto.randomUUID();
    const startsAt = new Date(Date.now() + 7 * 86_400_000);
    await db.insert(schema.orders).values({
      id: orderId,
      userId: student,
      teacherId: ids.teacher,
      kind: "visit",
      status: "paid",
      listPriceCents: 9000,
      studentPaysCents: 9000,
      paymentPath: "card",
      stripePaymentIntentId: "pi_stale",
    });
    await db.insert(schema.visitBookings).values({
      id: visitId,
      orderId,
      userId: student,
      serviceId,
      optionId,
      offeringKind: "appointment",
      startsAt,
      endsAt: new Date(startsAt.getTime() + 60 * 60_000),
    });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT id FROM orders WHERE id = $1 FOR UPDATE", [orderId]);
      await client.query("UPDATE orders SET status = 'refunded' WHERE id = $1", [orderId]);
      const pending = cancelVisit(student, visitId);
      await new Promise((resolve) => setTimeout(resolve, 200));
      await client.query("COMMIT");
      await expect(pending).resolves.toEqual({ ok: true });
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }
    expect(stripe.refund).not.toHaveBeenCalled();
    const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
    const [visit] = await db.select().from(schema.visitBookings).where(eq(schema.visitBookings.id, visitId));
    expect(order?.status).toBe("refunded");
    expect(visit?.status).toBe("cancelled");
  });

  it("treats an access add-on as occupying the next shared slot", async () => {
    const serviceId = crypto.randomUUID();
    await db.insert(schema.services).values({
      id: serviceId,
      teacherId: ids.teacher!,
      categoryId: ids.category!,
      slug: `${tag}-addon-sauna`,
      title: "Addon sauna",
      kind: "access",
      slotMinutes: 30,
      capacity: 1,
      priceCents: 2000,
      leadTimeHours: 0,
      status: "published",
    });
    for (let weekday = 0; weekday < 7; weekday += 1) {
      await db.insert(schema.availabilityWindows).values({ id: crypto.randomUUID(), serviceId, weekday, startTime: "00:00", endTime: "23:00" });
    }
    const addonId = crypto.randomUUID();
    await db.insert(schema.serviceAddons).values({ id: addonId, serviceId, name: "Extra steam", priceCents: 500, minutes: 30 });
    const open = await openSlotsForService(serviceId, new Date(), 2);
    if (open.kind !== "access") throw new Error("expected access");
    const first = open.slots[0]!;
    const next = open.slots.find((slot) => slot.startsAt.getTime() === first.startsAt.getTime() + 30 * 60_000);
    const after = open.slots.find((slot) => slot.startsAt.getTime() === first.startsAt.getTime() + 60 * 60_000);
    expect(next).toBeTruthy();
    expect(after).toBeTruthy();
    const student = await person("steam");
    const booked = await bookVisit({
      userId: student,
      email: "steam@example.com",
      serviceId,
      startsAt: first.startsAt.toISOString(),
      addonIds: [addonId],
    });
    expect(booked).toHaveProperty("orderId");
    const again = await openSlotsForService(serviceId, new Date(), 2);
    if (again.kind !== "access") throw new Error("expected access");
    expect(again.slots.some((slot) => slot.startsAt.getTime() === next!.startsAt.getTime())).toBe(false);
    expect(again.slots.some((slot) => slot.startsAt.getTime() === after!.startsAt.getTime())).toBe(true);
    const overlap = await bookVisit({
      userId: await person("steam-next"),
      email: "steam-next@example.com",
      serviceId,
      startsAt: next!.startsAt.toISOString(),
    });
    expect(overlap).toEqual({ error: "That slot is full." });
  });

  it("restores both visit credits when two cancels overlap", async () => {
    const serviceId = crypto.randomUUID();
    await db.insert(schema.services).values({
      id: serviceId,
      teacherId: ids.teacher!,
      categoryId: ids.category!,
      slug: `${tag}-restore`,
      title: "Restore sauna",
      kind: "access",
      slotMinutes: 30,
      capacity: 4,
      priceCents: 0,
      leadTimeHours: 0,
      status: "published",
    });
    const packId = crypto.randomUUID();
    await db.insert(schema.packs).values({ id: packId, teacherId: ids.teacher!, slug: `${tag}-two`, name: "Two", creditCount: 2, priceCents: 1000 });
    const student = await person("restore");
    const purchaseId = crypto.randomUUID();
    await db.insert(schema.packPurchases).values({
      id: purchaseId,
      userId: student,
      packId,
      teacherId: ids.teacher!,
      creditsTotal: 2,
      creditsRemaining: 0,
    });
    const planId = crypto.randomUUID();
    await db.insert(schema.memberships).values({
      id: planId,
      teacherId: ids.teacher!,
      slug: `${tag}-restore-plan`,
      name: "Restore",
      termMonths: 1,
      kind: "limited",
      classesPerPeriod: 4,
      priceCents: 5000,
    });
    const subId = crypto.randomUUID();
    await db.insert(schema.membershipSubscriptions).values({
      id: subId,
      userId: student,
      membershipId: planId,
      teacherId: ids.teacher!,
      status: "active",
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
      classesUsedThisPeriod: 2,
      classesPerPeriod: 4,
      unlimited: false,
    });
    const starts = new Date(Date.now() + 2 * 86_400_000);
    const visits = [0, 1].map((index) => ({
      id: crypto.randomUUID(),
      userId: student,
      serviceId,
      offeringKind: "access",
      startsAt: new Date(starts.getTime() + index * 60 * 60_000),
      endsAt: new Date(starts.getTime() + index * 60 * 60_000 + 30 * 60_000),
      packPurchaseId: purchaseId,
    }));
    const memberVisits = [2, 3].map((index) => ({
      id: crypto.randomUUID(),
      userId: student,
      serviceId,
      offeringKind: "access",
      startsAt: new Date(starts.getTime() + index * 60 * 60_000),
      endsAt: new Date(starts.getTime() + index * 60 * 60_000 + 30 * 60_000),
      membershipSubscriptionId: subId,
    }));
    await db.insert(schema.visitBookings).values([...visits, ...memberVisits]);
    const stored = await db.select().from(schema.visitBookings).where(inArray(schema.visitBookings.id, [...visits, ...memberVisits].map((visit) => visit.id)));
    await Promise.all(stored.map((visit) => releaseVisitSeat(visit, new Date())));
    const [purchase] = await db.select().from(schema.packPurchases).where(eq(schema.packPurchases.id, purchaseId));
    const [sub] = await db.select().from(schema.membershipSubscriptions).where(eq(schema.membershipSubscriptions.id, subId));
    expect(purchase?.creditsRemaining).toBe(2);
    expect(sub?.classesUsedThisPeriod).toBe(0);
  });

  it("refuses to sign a waiver version the student did not read", async () => {
    const waiverId = crypto.randomUUID();
    await db.insert(schema.waivers).values({
      id: waiverId,
      teacherId: ids.teacher!,
      body: "A liability waiver for this studio visit. Not medical advice.",
      version: 2,
    });
    const student = await person("waiver-version");
    const stale = await signWaiver({ teacherId: ids.teacher!, userId: student, signedName: "Ada Lee", ip: "203.0.113.8", version: 1 });
    expect(stale).toEqual({ error: "The waiver changed. Read the new version and sign again." });
    const rows = await db.select().from(schema.waiverSignatures).where(eq(schema.waiverSignatures.userId, student));
    expect(rows).toHaveLength(0);
    const current = await signWaiver({ teacherId: ids.teacher!, userId: student, signedName: "Ada Lee", ip: "203.0.113.8", version: 2 });
    expect(current).toEqual({ ok: true, version: 2 });
    const [saved] = await db.select().from(schema.waiverSignatures).where(eq(schema.waiverSignatures.userId, student));
    expect(saved?.version).toBe(2);
  });

  it("keeps the visit and pack credit when the cancel transaction rolls back", async () => {
    const { serviceId, optionId } = await appointment("Rollback", ids.teacher!, ids.category!);
    const student = await person("rollback");
    const packId = crypto.randomUUID();
    await db.insert(schema.packs).values({ id: packId, teacherId: ids.teacher!, slug: `${tag}-rollback`, name: "One", creditCount: 1, priceCents: 1000 });
    const purchaseId = crypto.randomUUID();
    await db.insert(schema.packPurchases).values({
      id: purchaseId,
      userId: student,
      packId,
      teacherId: ids.teacher!,
      creditsTotal: 1,
      creditsRemaining: 0,
    });
    const orderId = crypto.randomUUID();
    const visitId = crypto.randomUUID();
    const startsAt = new Date(Date.now() + 7 * 86_400_000);
    await db.insert(schema.orders).values({
      id: orderId,
      userId: student,
      teacherId: ids.teacher,
      kind: "visit",
      status: "pay_at_studio",
      listPriceCents: 9000,
      studentPaysCents: 9000,
      paymentPath: "cash",
    });
    await db.insert(schema.visitBookings).values({
      id: visitId,
      orderId,
      userId: student,
      serviceId,
      optionId,
      offeringKind: "appointment",
      startsAt,
      endsAt: new Date(startsAt.getTime() + 60 * 60_000),
      packPurchaseId: purchaseId,
    });
    const fn = `cancel_guard_${orderId.replace(/-/g, "").slice(0, 20)}`;
    await pool.query(`
      CREATE FUNCTION ${fn}() RETURNS trigger AS $guard$
      BEGIN
        IF NEW.status = 'cancelled' THEN
          RAISE EXCEPTION 'cancel order blocked';
        END IF;
        RETURN NEW;
      END;
      $guard$ LANGUAGE plpgsql
    `);
    await pool.query(`CREATE TRIGGER ${fn} BEFORE UPDATE ON orders FOR EACH ROW WHEN (NEW.id = '${orderId}') EXECUTE FUNCTION ${fn}()`);
    try {
      await cancelVisit(student, visitId);
      throw new Error("cancel should have rolled back");
    } catch (error) {
      const parts: string[] = [];
      let current: unknown = error;
      for (let depth = 0; current && depth < 5; depth += 1) {
        if (current instanceof Error) {
          parts.push(current.message);
          current = current.cause;
        } else {
          parts.push(String(current));
          break;
        }
      }
      expect(parts.join(" ")).toMatch(/cancel order blocked/);
    } finally {
      await pool.query(`DROP TRIGGER IF EXISTS ${fn} ON orders`);
      await pool.query(`DROP FUNCTION IF EXISTS ${fn}()`);
    }
    const [visit] = await db.select().from(schema.visitBookings).where(eq(schema.visitBookings.id, visitId));
    const [purchase] = await db.select().from(schema.packPurchases).where(eq(schema.packPurchases.id, purchaseId));
    const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
    expect(visit?.status).toBe("confirmed");
    expect(purchase?.creditsRemaining).toBe(0);
    expect(order?.status).toBe("pay_at_studio");
  });
});
