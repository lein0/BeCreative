"use server";

import { revalidatePath } from "next/cache";
import { requireActor } from "@/lib/actor";
import { db } from "@/lib/db";
import { triggerOverrides } from "@/lib/db/schema";
import { sendEmail } from "@/lib/email";
import { renderEmail } from "@/lib/email-templates";
import { appOrigin } from "@/lib/env";
import { canViewPlatformStats } from "@/lib/permissions";
import { hitRateLimit } from "@/lib/rate-limit";
import { TRIGGERS } from "@/lib/triggers";

export async function toggleTriggerAction(formData: FormData) {
  const actor = await requireActor();
  if (!canViewPlatformStats(actor.roles)) return;
  const id = String(formData.get("id") ?? "");
  if (!TRIGGERS.some((trigger) => trigger.id === id)) return;
  const enabled = formData.get("enabled") === "1";
  await db.insert(triggerOverrides).values({ id, enabled }).onConflictDoUpdate({ target: triggerOverrides.id, set: { enabled } });
  revalidatePath("/admin/triggers");
}

export async function sendTriggerTestAction(formData: FormData) {
  const actor = await requireActor();
  if (!canViewPlatformStats(actor.roles)) return;
  const limit = await hitRateLimit(`trigger-test:${actor.id}`, 20, 60 * 60 * 1000);
  if (!limit.ok) return;
  const id = String(formData.get("id") ?? "");
  const trigger = TRIGGERS.find((item) => item.id === id);
  if (!trigger) return;
  const rendered = await renderEmail(trigger.template, {
    name: actor.name,
    title: "Scene Study",
    body: "This is a test of the trigger. Tuesday at 7pm.",
    href: `${appOrigin()}/bookings`,
    detail: "3 bookings, $90 to the studio, top link: maya-alvarez.",
  });
  await sendEmail({ to: [actor.email], subject: `[test] ${rendered.subject}`, text: rendered.text, html: rendered.html });
  revalidatePath("/admin/triggers");
}

export async function saveContactPrefsAction(formData: FormData) {
  const actor = await requireActor();
  const { applyContactPrefs } = await import("@/lib/contact-prefs");
  await applyContactPrefs(actor.id, formData, "capture");
  revalidatePath("/settings/notifications");
}
