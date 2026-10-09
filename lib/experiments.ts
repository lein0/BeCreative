import { and, eq, sql } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { ANON_COOKIE, ANON_HEADER, experimentSubject } from "@/lib/anon";
import { assignVariant } from "@/lib/analytics-math";
import { capture } from "@/lib/analytics";
import { db } from "@/lib/db";
import { analyticsEvents, experimentVariants, experiments } from "@/lib/db/schema";

export async function loadExperiment(key: string) {
  const [experiment] = await db.select().from(experiments).where(eq(experiments.key, key)).limit(1);
  if (!experiment) return null;
  const variants = await db.select().from(experimentVariants).where(eq(experimentVariants.experimentId, experiment.id));
  return { experiment, variants };
}

export async function assignExperiment(key: string, subjectId: string) {
  const loaded = await loadExperiment(key);
  if (!loaded || !loaded.variants.length) return null;
  if (loaded.experiment.status === "stopped" && loaded.experiment.winnerVariant) {
    const winner = loaded.variants.find((variant) => variant.key === loaded.experiment.winnerVariant) ?? loaded.variants[0]!;
    return { experiment: loaded.experiment, variant: winner, subjectId };
  }
  if (loaded.experiment.status !== "running") {
    return { experiment: loaded.experiment, variant: loaded.variants[0]!, subjectId };
  }
  const chosen = assignVariant(subjectId, key, loaded.variants.map((variant) => ({ key: variant.key, weight: variant.weight })));
  const variant = loaded.variants.find((item) => item.key === chosen) ?? loaded.variants[0]!;
  return { experiment: loaded.experiment, variant, subjectId };
}

export async function exposeExperiment(key: string, subjectId: string, userId?: string | null, platform?: string) {
  const assigned = await assignExperiment(key, subjectId);
  if (!assigned) return null;
  const [existing] = await db
    .select({ id: analyticsEvents.id })
    .from(analyticsEvents)
    .where(and(eq(analyticsEvents.name, "experiment_exposed"), eq(analyticsEvents.anonymousId, subjectId), sql`${analyticsEvents.properties}->>'experiment' = ${key}`))
    .limit(1);
  if (!existing && assigned.experiment.status === "running") {
    await capture({
      name: "experiment_exposed",
      anonymousId: subjectId,
      userId,
      platform,
      properties: { experiment: key, variant: assigned.variant.key },
    });
  }
  return { key, variant: assigned.variant.key, payload: assigned.variant.payload, goalEvent: assigned.experiment.goalEvent, status: assigned.experiment.status };
}

export async function subjectFromCookies(userId?: string | null) {
  let cookie: string | null = null;
  let header: string | null = null;
  try {
    const jar = await cookies();
    cookie = jar.get(ANON_COOKIE)?.value ?? null;
  } catch {
    cookie = null;
  }
  if (!cookie) {
    try {
      const headerStore = await headers();
      header = headerStore.get(ANON_HEADER);
    } catch {
      header = null;
    }
  }
  return experimentSubject({ cookie, header, userId });
}

export async function serverExperiment(key: string, userId?: string | null, platform?: string) {
  const subject = await subjectFromCookies(userId);
  return exposeExperiment(key, subject, userId, platform);
}
