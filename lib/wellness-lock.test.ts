import { config } from "dotenv";
import { afterAll, describe, expect, it } from "vitest";

config({ path: ".env.local" });

const { eq } = await import("drizzle-orm");
const { db } = await import("@/lib/db");
const schema = await import("@/lib/db/schema");
const { bookVisit, openSlotsForService, signWaiver } = await import("@/lib/wellness-service");

const tag = `lock-${crypto.randomUUID().slice(0, 8)}`;
const ids: { teacher?: string; users: string[]; services: string[]; category?: string } = { users: [], services: [] };

async function person(name: string) {
  const id = crypto.randomUUID();
  ids.users.push(id);
  await db.insert(schema.user).values({ id, name, email: `${tag}-${name}@example.com`, emailVerified: true, createdAt: new Date(), updatedAt: new Date() });
  return id;
}

describe("wellness booking locks", () => {
  afterAll(async () => {
    if (ids.teacher) await db.delete(schema.teachers).where(eq(schema.teachers.id, ids.teacher));
    if (ids.users.length) {
      const { inArray } = await import("drizzle-orm");
      await db.delete(schema.orders).where(inArray(schema.orders.userId, ids.users));
      await db.delete(schema.user).where(inArray(schema.user.id, ids.users));
    }
    if (ids.category) await db.delete(schema.categories).where(eq(schema.categories.id, ids.category));
  });

  it("books one appointment and refuses the overlapping second", async () => {
    await db.insert(schema.platformSettings).values({ id: 1, feePercent: 10, feeFixedCents: 0 }).onConflictDoNothing();
    const categoryId = crypto.randomUUID();
    ids.category = categoryId;
    await db.insert(schema.categories).values({ id: categoryId, name: "Lock yoga", slug: `${tag}-yoga`, vertical: "wellness" });
    const owner = await person("owner");
    const teacherId = crypto.randomUUID();
    ids.teacher = teacherId;
    await db.insert(schema.teachers).values({ id: teacherId, userId: owner, slug: `${tag}-studio`, studioName: "Lock Studio", status: "approved", bio: "" });
    const serviceId = crypto.randomUUID();
    ids.services.push(serviceId);
    await db.insert(schema.services).values({
      id: serviceId,
      teacherId,
      categoryId,
      slug: `${tag}-private`,
      title: "Private hour",
      kind: "appointment",
      bufferMinutes: 15,
      leadTimeHours: 0,
      cancellationHours: 24,
      status: "published",
    });
    await db.insert(schema.serviceOptions).values({ id: crypto.randomUUID(), serviceId, label: "60 min", minutes: 60, priceCents: 9000, sortOrder: 0 });
    for (let weekday = 0; weekday < 7; weekday += 1) {
      await db.insert(schema.availabilityWindows).values({ id: crypto.randomUUID(), serviceId, weekday, startTime: "00:00", endTime: "23:00" });
    }
    const open = await openSlotsForService(serviceId, new Date(), 2);
    expect(open.kind).toBe("appointment");
    if (open.kind !== "appointment") return;
    const slot = open.options[0]?.slots[0];
    expect(slot).toBeTruthy();
    const optionId = open.options[0]!.optionId;
    const studentA = await person("a");
    const studentB = await person("b");
    const [first, second] = await Promise.all([
      bookVisit({ userId: studentA, email: "a@example.com", serviceId, optionId, startsAt: slot!.startsAt.toISOString() }),
      bookVisit({ userId: studentB, email: "b@example.com", serviceId, optionId, startsAt: slot!.startsAt.toISOString() }),
    ]);
    const results = [first, second];
    expect(results.filter((result) => "orderId" in result && result.orderId).length).toBe(1);
    expect(results.some((result) => "error" in result && /taken|not open/i.test(result.error ?? ""))).toBe(true);
  });

  it("stops a shared slot at its capacity", async () => {
    const teacherId = ids.teacher!;
    const categoryId = ids.category!;
    const serviceId = crypto.randomUUID();
    await db.insert(schema.services).values({
      id: serviceId,
      teacherId,
      categoryId,
      slug: `${tag}-sauna`,
      title: "Sauna",
      kind: "access",
      slotMinutes: 30,
      capacity: 2,
      priceCents: 2000,
      leadTimeHours: 0,
      status: "published",
    });
    for (let weekday = 0; weekday < 7; weekday += 1) {
      await db.insert(schema.availabilityWindows).values({ id: crypto.randomUUID(), serviceId, weekday, startTime: "00:00", endTime: "23:00" });
    }
    const open = await openSlotsForService(serviceId, new Date(), 2);
    expect(open.kind).toBe("access");
    if (open.kind !== "access") return;
    const slot = open.slots[0];
    expect(slot?.left).toBe(2);
    const people = await Promise.all([person("c"), person("d"), person("e")]);
    const booked = await Promise.all(people.map((userId, index) => bookVisit({
      userId,
      email: `${index}@example.com`,
      serviceId,
      startsAt: slot!.startsAt.toISOString(),
    })));
    expect(booked.filter((result) => "orderId" in result && result.orderId).length).toBe(2);
    expect(booked.some((result) => "error" in result && result.error === "That slot is full.")).toBe(true);
  });

  it("requires the current waiver version before the first booking", async () => {
    const teacherId = ids.teacher!;
    const categoryId = ids.category!;
    const serviceId = crypto.randomUUID();
    await db.insert(schema.services).values({
      id: serviceId,
      teacherId,
      categoryId,
      slug: `${tag}-massage`,
      title: "Massage",
      kind: "appointment",
      bufferMinutes: 0,
      leadTimeHours: 0,
      waiverRequired: true,
      status: "published",
    });
    const optionId = crypto.randomUUID();
    await db.insert(schema.serviceOptions).values({ id: optionId, serviceId, label: "60 min", minutes: 60, priceCents: 10000, sortOrder: 0 });
    for (let weekday = 0; weekday < 7; weekday += 1) {
      await db.insert(schema.availabilityWindows).values({ id: crypto.randomUUID(), serviceId, weekday, startTime: "00:00", endTime: "23:00" });
    }
    await db.insert(schema.waivers).values({ id: crypto.randomUUID(), teacherId, body: "A liability waiver for this studio visit. Not medical.", version: 1 });
    const open = await openSlotsForService(serviceId, new Date(), 2);
    if (open.kind !== "appointment") throw new Error("expected an appointment");
    const startsAt = open.options[0]!.slots[0]!.startsAt.toISOString();
    const student = await person("f");
    const blocked = await bookVisit({ userId: student, email: "f@example.com", serviceId, optionId, startsAt });
    expect(blocked).toEqual({ error: "Sign the studio waiver before booking." });
    const signed = await signWaiver({ teacherId, userId: student, signedName: "Fern Lee", ip: "203.0.113.10" });
    expect(signed).toMatchObject({ ok: true, version: 1 });
    const booked = await bookVisit({ userId: student, email: "f@example.com", serviceId, optionId, startsAt });
    expect(booked).toHaveProperty("orderId");
    const [row] = await db.select().from(schema.waiverSignatures).where(eq(schema.waiverSignatures.userId, student));
    expect(row?.signedName).toBe("Fern Lee");
    expect(row?.ip).toBe("203.0.113.10");
    expect(row?.version).toBe(1);
  });
});
