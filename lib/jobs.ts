import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { jobs } from "@/lib/db/schema";
import { JOB_MAX_ATTEMPTS, JOB_STALE_MINUTES, jobOutcomeAfterError, jobRetryDelayMs } from "@/lib/job-rules";

export { JOB_MAX_ATTEMPTS, JOB_STALE_MINUTES, crashedJobShouldStop, jobIsClaimable, jobOutcomeAfterError, jobRetryDelayMs } from "@/lib/job-rules";

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
  await db.execute(sql`
    update jobs
    set status = 'failed', last_error = 'Stopped after repeated crashes', locked_at = null
    where status = 'running'
      and attempts >= ${JOB_MAX_ATTEMPTS}
      and (locked_at is null or locked_at <= now() - make_interval(mins => ${JOB_STALE_MINUTES}))
  `);
  const result = await db.execute<{ id: string; kind: string; payload: Record<string, unknown>; attempts: number }>(sql`
    update jobs
    set status = 'running', locked_at = now(), attempts = attempts + 1
    where id in (
      select id from jobs
      where attempts < ${JOB_MAX_ATTEMPTS}
        and (
          (status = 'queued' and run_at <= now())
          or (status = 'running' and (locked_at is null or locked_at <= now() - make_interval(mins => ${JOB_STALE_MINUTES})))
        )
      order by run_at
      for update skip locked
      limit ${limit}
    )
    returning id, kind, payload, attempts
  `);
  return result.rows;
}

export async function finishJob(id: string, error?: string) {
  if (!error) {
    await db.execute(sql`update jobs set status = 'done', last_error = null, locked_at = null where id = ${id}`);
    return;
  }
  const [row] = await db.select({ attempts: jobs.attempts }).from(jobs).where(eq(jobs.id, id)).limit(1);
  const attempts = row?.attempts ?? 1;
  if (jobOutcomeAfterError(attempts) === "queued") {
    const runAt = new Date(Date.now() + jobRetryDelayMs(attempts));
    await db.execute(sql`update jobs set status = 'queued', last_error = ${error}, locked_at = null, run_at = ${runAt} where id = ${id}`);
    return;
  }
  await db.execute(sql`update jobs set status = 'failed', last_error = ${error}, locked_at = null where id = ${id}`);
}

export function cronAuthorized(header: string | null) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return header === `Bearer ${secret}`;
}
