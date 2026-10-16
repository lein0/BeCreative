import { config } from "dotenv";
import { afterAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";

config({ path: ".env.local" });

const { db } = await import("@/lib/db");
const schema = await import("@/lib/db/schema");
const { findUserByEmail } = await import("@/lib/email");
const { notifyTeacherOfBooking } = await import("@/lib/worker");

const tag = `sms-${crypto.randomUUID().slice(0, 8)}`;
const userIds: string[] = [];
const teacherIds: string[] = [];

describe("signup and first booking", () => {
  afterAll(async () => {
    if (teacherIds.length) await db.delete(schema.teachers).where(inArray(schema.teachers.id, teacherIds));
    if (userIds.length) await db.delete(schema.user).where(inArray(schema.user.id, userIds));
  });

  it("finds a new account when the stored email differs by case", async () => {
    const id = crypto.randomUUID();
    userIds.push(id);
    await db.insert(schema.user).values({ id, name: "Jules", email: `Jules-${tag}@Example.com`, emailVerified: false });
    const found = await findUserByEmail(`jules-${tag}@example.com`);
    expect(found?.id).toBe(id);
  });

  it("celebrates the first confirmed seat and ignores a cancelled row", async () => {
    const owner = crypto.randomUUID();
    const teacherId = crypto.randomUUID();
    userIds.push(owner);
    teacherIds.push(teacherId);
    await db.insert(schema.user).values({ id: owner, name: "Teacher", email: `teach-${tag}@example.com`, emailVerified: true });
    await db.insert(schema.teachers).values({ id: teacherId, userId: owner, slug: `${tag}-studio`, studioName: "Studio", status: "approved" });
    const categoryId = crypto.randomUUID();
    await db.insert(schema.categories).values({ id: categoryId, name: "Voice", slug: `${tag}-voice` });
    const classId = crypto.randomUUID();
    await db.insert(schema.classes).values({
      id: classId, teacherId, categoryId, slug: `${tag}-class`, title: "Voice", skillLevel: "all", format: "class", delivery: "virtual", maxSize: 8, durationMinutes: 60, pricePerSessionCents: 2000, status: "published",
    });
    await db.insert(schema.bookings).values({ id: crypto.randomUUID(), userId: owner, classId, kind: "session", status: "cancelled" });
    await notifyTeacherOfBooking({ teacherUserId: owner, studentName: "Sam", title: "Voice", href: "/teach" });
    const early = await db.select().from(schema.notificationOutbox).where(and(eq(schema.notificationOutbox.userId, owner), eq(schema.notificationOutbox.event, "teacher.first_booking")));
    expect(early).toHaveLength(0);
    await db.insert(schema.bookings).values({ id: crypto.randomUUID(), userId: owner, classId, kind: "session", status: "confirmed" });
    await notifyTeacherOfBooking({ teacherUserId: owner, studentName: "Sam", title: "Voice", href: "/teach" });
    const later = await db.select().from(schema.notificationOutbox).where(and(eq(schema.notificationOutbox.userId, owner), eq(schema.notificationOutbox.event, "teacher.first_booking")));
    expect(later).toHaveLength(1);
    await db.delete(schema.classes).where(eq(schema.classes.id, classId));
    await db.delete(schema.categories).where(eq(schema.categories.id, categoryId));
  });
});
