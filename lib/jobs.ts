import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { jobs } from "@/lib/db/schema";

export async function enqueueJob(kind: string, payload: Record<string, unknown>, runAt = new Date(), idempotencyKey?: string) {
  const id = crypto.randomUUID();
  await db.insert(jobs).values({
    id,
    kind,
    payload,
    runAt,
    status: "queued",
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

export async function ensureQueuedJob(kind: string, payload: Record<string, unknown>, runAt = new Date(), idempotencyKey?: string) {
  if (!idempotencyKey) return enqueueJob(kind, payload, runAt);
  const [existing] = await db.select().from(jobs).where(eq(jobs.idempotencyKey, idempotencyKey)).limit(1);
  if (!existing) return enqueueJob(kind, payload, runAt, idempotencyKey);
  if (existing.status === "running") return existing.id;
  if (existing.status === "queued") {
    if (existing.runAt.getTime() > runAt.getTime()) await db.update(jobs).set({ runAt, payload }).where(eq(jobs.id, existing.id));
    return existing.id;
  }
  await db.update(jobs).set({ status: "queued", runAt, payload, lockedAt: null, lastError: null, attempts: 0 }).where(eq(jobs.id, existing.id));
  return existing.id;
}

export async function requeueJob(id: string, runAt: Date, error?: string) {
  await db.update(jobs).set({ status: "queued", runAt, lockedAt: null, lastError: error ?? null }).where(eq(jobs.id, id));
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
