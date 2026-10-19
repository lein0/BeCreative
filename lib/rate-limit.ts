import { lt, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { rateBuckets } from "@/lib/db/schema";

/**
 * Count a hit in one upsert. Postgres locks the conflicting row, so parallel
 * requests cannot all pass a count they read earlier. A full window returns
 * no row, which is a denial. An expired window starts again at 1.
 */
export async function hitRateLimit(key: string, limit: number, windowMs: number) {
  if (limit < 1) return { ok: false as const };
  const now = new Date();
  const cutoff = new Date(now.getTime() - windowMs);
  const counted = await db
    .insert(rateBuckets)
    .values({ key, windowStart: now, count: 1 })
    .onConflictDoUpdate({
      target: rateBuckets.key,
      set: {
        windowStart: sql`case when ${rateBuckets.windowStart} < ${cutoff} then ${now} else ${rateBuckets.windowStart} end`,
        count: sql`case when ${rateBuckets.windowStart} < ${cutoff} then 1 else ${rateBuckets.count} + 1 end`,
      },
      setWhere: or(lt(rateBuckets.windowStart, cutoff), lt(rateBuckets.count, limit)),
    })
    .returning({ count: rateBuckets.count });
  return counted.length > 0 ? { ok: true as const } : { ok: false as const };
}
