"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireActor } from "@/lib/actor";
import { db } from "@/lib/db";
import { memberships, teachers } from "@/lib/db/schema";
import { canViewPlatformStats } from "@/lib/permissions";
import { PRICE_CHANGE_MIN_DAYS_TEACHER, type RenewalTemplates } from "@/lib/renewal-copy";
import { cancelMembership, saveRenewalTemplate, scheduleMaterialChange, scheduleMembershipPriceChange, setRenewalSaveOffer } from "@/lib/renewal";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

async function auditHeaders() {
  const requestHeaders = await headers();
  return {
    ip: requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
    userAgent: requestHeaders.get("user-agent"),
  };
}

export async function confirmCancelAction(formData: FormData) {
  const actor = await requireActor();
  const subscriptionId = text(formData, "subscriptionId");
  const audit = await auditHeaders();
  const result = await cancelMembership({
    subscriptionId,
    actorUserId: actor.id,
    source: "member",
    platform: "web",
    ip: audit.ip,
    userAgent: audit.userAgent,
  });
  if ("error" in result && result.error) redirect(`/account/memberships/${subscriptionId}/cancel?error=${encodeURIComponent(result.error)}`);
  redirect(`/account/memberships/${subscriptionId}/cancel?done=1`);
}

export async function adminCancelMembershipAction(formData: FormData) {
  const actor = await requireActor();
  if (!canViewPlatformStats(actor.roles)) redirect("/");
  const subscriptionId = text(formData, "subscriptionId");
  const audit = await auditHeaders();
  const result = await cancelMembership({
    subscriptionId,
    actorUserId: actor.id,
    source: "admin",
    platform: "web",
    ip: audit.ip,
    userAgent: audit.userAgent,
  });
  if ("error" in result && result.error) redirect(`/admin/renewals?error=${encodeURIComponent(result.error)}`);
  redirect("/admin/renewals?cancelled=1");
}

export async function schedulePriceChangeAction(formData: FormData) {
  const actor = await requireActor();
  const teacherId = text(formData, "teacherId");
  const [teacher] = await db.select().from(teachers).where(eq(teachers.id, teacherId)).limit(1);
  if (!teacher || (teacher.userId !== actor.id && !canViewPlatformStats(actor.roles))) redirect("/teach/pricing?error=You+can't+edit+this+studio.");
  const membershipId = text(formData, "membershipId");
  const [plan] = await db.select().from(memberships).where(eq(memberships.id, membershipId)).limit(1);
  if (!plan || plan.teacherId !== teacher.id) redirect("/teach/pricing?error=Membership+not+found.");
  const effective = new Date(`${text(formData, "effective")}T15:00:00`);
  const result = await scheduleMembershipPriceChange({
    membershipId,
    newPriceCents: Math.round(Number(text(formData, "price") || 0) * 100),
    effectiveAt: effective,
    actorUserId: actor.id,
    minDays: PRICE_CHANGE_MIN_DAYS_TEACHER,
  });
  if ("error" in result && result.error) redirect(`/teach/pricing?error=${encodeURIComponent(result.error)}`);
  redirect("/teach/pricing?scheduled=1");
}

export async function scheduleMaterialChangeAction(formData: FormData) {
  const actor = await requireActor();
  const teacherId = text(formData, "teacherId");
  const [teacher] = await db.select().from(teachers).where(eq(teachers.id, teacherId)).limit(1);
  if (!teacher || (teacher.userId !== actor.id && !canViewPlatformStats(actor.roles))) redirect("/teach/pricing");
  const membershipId = text(formData, "membershipId");
  const [plan] = await db.select().from(memberships).where(eq(memberships.id, membershipId)).limit(1);
  if (!plan || plan.teacherId !== teacher.id) redirect("/teach/pricing?error=Membership+not+found.");
  const result = await scheduleMaterialChange({
    membershipId,
    summary: text(formData, "summary"),
    effectiveAt: new Date(`${text(formData, "effective")}T15:00:00`),
    actorUserId: actor.id,
  });
  if ("error" in result && result.error) redirect(`/teach/pricing?error=${encodeURIComponent(result.error)}`);
  redirect("/teach/pricing?scheduled=1");
}

export async function saveRenewalTemplateAction(formData: FormData) {
  const actor = await requireActor();
  if (!canViewPlatformStats(actor.roles)) redirect("/");
  const body: Partial<RenewalTemplates> = {
    disclosureTitle: text(formData, "disclosureTitle"),
    disclosureCharge: text(formData, "disclosureCharge"),
    disclosureIntro: text(formData, "disclosureIntro"),
    checkbox: text(formData, "checkbox"),
    ackSubject: text(formData, "ackSubject"),
    ackBody: text(formData, "ackBody"),
    cancelSubject: text(formData, "cancelSubject"),
    cancelBody: text(formData, "cancelBody"),
  };
  const result = await saveRenewalTemplate({ actorUserId: actor.id, legalSignoff: text(formData, "legalSignoff"), body });
  if ("error" in result && result.error) redirect(`/admin/renewals?error=${encodeURIComponent(result.error)}`);
  redirect("/admin/renewals?saved=1");
}

export async function toggleSaveOfferAction(formData: FormData) {
  const actor = await requireActor();
  if (!canViewPlatformStats(actor.roles)) redirect("/");
  await setRenewalSaveOffer(formData.get("enabled") === "on", actor.id);
  redirect("/admin/renewals");
}
