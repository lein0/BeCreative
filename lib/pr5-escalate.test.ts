import { config } from "dotenv";
import { afterAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";

config({ path: ".env.local" });

const { db } = await import("@/lib/db");
const schema = await import("@/lib/db/schema");
const { escalateDueTickets } = await import("@/lib/support");

const tag = `esc-${crypto.randomUUID().slice(0, 8)}`;
const userIds: string[] = [];
const ticketIds: string[] = [];

describe("ticket escalation", () => {
  afterAll(async () => {
    if (ticketIds.length) await db.delete(schema.tickets).where(inArray(schema.tickets.id, ticketIds));
    if (userIds.length) await db.delete(schema.user).where(inArray(schema.user.id, userIds));
  });

  it("escalates a waiting class ticket after the teacher SLA", async () => {
    const userId = crypto.randomUUID();
    const ticketId = crypto.randomUUID();
    userIds.push(userId);
    ticketIds.push(ticketId);
    await db.insert(schema.user).values({ id: userId, name: "Sam", email: `${tag}@example.com`, emailVerified: true });
    await db.insert(schema.tickets).values({
      id: ticketId,
      userId,
      category: "class",
      subject: "Where do I stand?",
      status: "waiting",
      route: "teacher",
      createdAt: new Date(Date.now() - 48 * 3_600_000),
    });
    await db.insert(schema.ticketMessages).values({
      id: crypto.randomUUID(),
      ticketId,
      authorUserId: userId,
      body: "Following up",
    });
    await escalateDueTickets(new Date());
    const [ticket] = await db.select().from(schema.tickets).where(eq(schema.tickets.id, ticketId));
    expect(ticket?.route).toBe("admin");
    expect(ticket?.escalatedAt).toBeTruthy();
  });
});
