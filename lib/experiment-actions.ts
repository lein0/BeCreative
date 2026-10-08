"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActor } from "@/lib/actor";
import { db } from "@/lib/db";
import { experiments } from "@/lib/db/schema";
import { canViewPlatformStats } from "@/lib/permissions";

async function guard() {
  const actor = await requireActor();
  if (!canViewPlatformStats(actor.roles)) redirect("/");
  return actor;
}

export async function setExperimentStatusAction(formData: FormData) {
  await guard();
  const key = String(formData.get("key") ?? "");
  const status = String(formData.get("status") ?? "");
  if (status !== "running" && status !== "stopped" && status !== "draft") return;
  await db.update(experiments).set({ status }).where(eq(experiments.key, key));
  revalidatePath(`/admin/analytics/experiments/${key}`);
}

export async function rollOutWinnerAction(formData: FormData) {
  await guard();
  const key = String(formData.get("key") ?? "");
  const winner = String(formData.get("winner") ?? "");
  await db.update(experiments).set({ status: "stopped", winnerVariant: winner }).where(eq(experiments.key, key));
  revalidatePath(`/admin/analytics/experiments/${key}`);
}
