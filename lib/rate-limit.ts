import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { rateBuckets } from "@/lib/db/schema";

export async function hitRateLimit(key: string, limit: number, windowMs: number) {
  const now = new Date();
  const [row] = await db.select().from(rateBuckets).where(eq(rateBuckets.key, key)).limit(1);
  if (!row || now.getTime() - row.windowStart.getTime() > windowMs) {
    await db.insert(rateBuckets).values({ key, windowStart: now, count: 1 }).onConflictDoUpdate({ target: rateBuckets.key, set: { windowStart: now, count: 1 } });
    return { ok: true as const };
  }
  if (row.count >= limit) return { ok: false as const };
  await db.update(rateBuckets).set({ count: row.count + 1 }).where(eq(rateBuckets.key, key));
  return { ok: true as const };
}
