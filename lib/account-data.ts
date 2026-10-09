import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { cancelRenewalsForAccountDeletion } from "@/lib/renewal";
import { account, apiTokens, bookings, notifications, orders, session, user } from "@/lib/db/schema";

const SOCIAL_PROVIDER_IDS = ["apple", "google"];

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

export async function releaseSocialLogin(userId: string) {
  await db.delete(account).where(and(eq(account.userId, userId), inArray(account.providerId, SOCIAL_PROVIDER_IDS)));
  await db.delete(session).where(eq(session.userId, userId));
  await db.update(apiTokens).set({ revokedAt: new Date() }).where(and(eq(apiTokens.userId, userId), isNull(apiTokens.revokedAt)));
}

export async function sessionAllowedForUser(userId: string) {
  if (!userId) return false;
  const [row] = await db.select({ deletedAt: user.deletedAt }).from(user).where(eq(user.id, userId)).limit(1);
  return Boolean(row && !row.deletedAt);
}

export async function deleteAccount(userId: string) {
  const cancelled = await cancelRenewalsForAccountDeletion(userId);
  if (!cancelled.ok) throw new Error(cancelled.error);
  await db.update(user).set({
    name: "Deleted account",
    email: `deleted+${userId}@users.invalid`,
    image: null,
    deletedAt: new Date(),
    emailUnsubscribed: true,
  }).where(eq(user.id, userId));
  await releaseSocialLogin(userId);
  await db.delete(account).where(eq(account.userId, userId));
}
