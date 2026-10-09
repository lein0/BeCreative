import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { jobs } from "@/lib/db/schema";

export async function enqueueJob(kind: string, payload: Record<string, unknown>, runAt = new Date(), idempotencyKey?: string) {
  const id = crypto.randomUUID();
  await db.insert(jobs).values({
    id,
    kind,
    payload,
    runAt,
    idempotencyKey: idempotencyKey ?? null,
  }).onConflictDoNothing();
  return id;
}

export async function claimJobs(limit = 20) {
  const result = await db.execute<{ id: string; kind: string; payload: Record<string, unknown>; attempts: number }>(sql`
    update jobs
    set status = 'running', locked_at = now(), attempts = attempts + 1
    where id in (
      select id from jobs
      where status = 'queued' and run_at <= now()
      order by run_at
      for update skip locked
      limit ${limit}
    )
    returning id, kind, payload, attempts
  `);
  return result.rows;
}

export async function finishJob(id: string, error?: string) {
  if (error) {
    await db.execute(sql`update jobs set status = 'failed', last_error = ${error} where id = ${id}`);
    return;
  }
  await db.execute(sql`update jobs set status = 'done', last_error = null where id = ${id}`);
}

export function cronAuthorized(header: string | null) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return header === `Bearer ${secret}`;
}
