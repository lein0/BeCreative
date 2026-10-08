import { config } from "dotenv";
import { afterAll, describe, expect, it } from "vitest";

config({ path: ".env.local" });

const { eq, inArray } = await import("drizzle-orm");
const { db } = await import("@/lib/db");
const schema = await import("@/lib/db/schema");
const { deleteAccount } = await import("@/lib/account-data");

const userIds: string[] = [];

describe("account deletion retention", () => {
  afterAll(async () => {
    if (!userIds.length) return;
    await db.delete(schema.orders).where(inArray(schema.orders.userId, userIds));
    await db.delete(schema.user).where(inArray(schema.user.id, userIds));
  });

  it("anonymizes the person, revokes app tokens, and keeps the ledger row", async () => {
    const userId = crypto.randomUUID();
    userIds.push(userId);
    const orderId = crypto.randomUUID();
    const tokenId = crypto.randomUUID();
    const sessionId = crypto.randomUUID();
    await db.insert(schema.user).values({ id: userId, name: "Jules Navarro", email: `delete-${userId}@example.com`, emailVerified: true });
    await db.insert(schema.session).values({ id: sessionId, userId, token: `sess-${userId}`, expiresAt: new Date(Date.now() + 3_600_000) });
    await db.insert(schema.apiTokens).values({ id: tokenId, userId, tokenHash: `hash-${userId}`, expiresAt: new Date(Date.now() + 86_400_000) });
    await db.insert(schema.orders).values({ id: orderId, userId, kind: "class", status: "paid", studentPaysCents: 2500 });

    await deleteAccount(userId);

    const [person] = await db.select().from(schema.user).where(eq(schema.user.id, userId));
    expect(person?.name).toBe("Deleted account");
    expect(person?.email).toBe(`deleted+${userId}@users.invalid`);
    expect(person?.deletedAt).toBeTruthy();
    expect(person?.emailUnsubscribed).toBe(true);
    const sessions = await db.select().from(schema.session).where(eq(schema.session.userId, userId));
    expect(sessions).toHaveLength(0);
    const [token] = await db.select().from(schema.apiTokens).where(eq(schema.apiTokens.id, tokenId));
    expect(token?.revokedAt).toBeTruthy();
    const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
    expect(order?.userId).toBe(userId);
    expect(order?.studentPaysCents).toBe(2500);
  });
});
