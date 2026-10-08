import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookings, notifications, orders, session, user } from "@/lib/db/schema";

export async function exportAccount(userId: string) {
  const [person] = await db.select().from(user).where(eq(user.id, userId)).limit(1);
  const bookingRows = await db.select().from(bookings).where(eq(bookings.userId, userId));
  const orderRows = await db.select().from(orders).where(eq(orders.userId, userId));
  const notes = await db.select().from(notifications).where(eq(notifications.userId, userId));
  return {
    exportedAt: new Date().toISOString(),
    profile: person ? { id: person.id, name: person.name, email: person.email, createdAt: person.createdAt } : null,
    bookings: bookingRows.map((row) => ({ id: row.id, status: row.status, kind: row.kind, classId: row.classId })),
    orders: orderRows.map((row) => ({ id: row.id, status: row.status, kind: row.kind, studentPaysCents: row.studentPaysCents, refundedCents: row.refundedCents })),
    notifications: notes.map((row) => ({ title: row.title, body: row.body, createdAt: row.createdAt })),
  };
}

export async function deleteAccount(userId: string) {
  await db.update(user).set({
    name: "Deleted account",
    email: `deleted+${userId}@users.invalid`,
    image: null,
    deletedAt: new Date(),
    emailUnsubscribed: true,
  }).where(eq(user.id, userId));
  await db.delete(session).where(eq(session.userId, userId));
}
