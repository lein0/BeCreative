import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { account, leadActivities, leads, teachers, user, userRoles, verification } from "@/lib/db/schema";
import { sendEmail } from "@/lib/email";
import { inviteActivityNote, inviteSetPasswordUrl, teacherInviteEmail } from "@/lib/invites";
import { passwordResetIdentifier } from "@/lib/review-rules";
import { offersOnlineOf, planLeadImport, priorityOf, rowsFromCsv, statusOf, toCsv, websiteDomain, type LeadCsvRow } from "@/lib/leads";
import { uniqueSlug } from "@/lib/utils";
import { OUTREACH_LABELS, type OutreachStatus } from "@/lib/constants";
import { appOrigin } from "@/lib/env";

export function leadToCsv(rows: (typeof leads.$inferSelect)[], reps: Map<string, string>): string {
  const mapped: LeadCsvRow[] = rows.map((lead) => ({
    lead_id: lead.id,
    business_name: lead.businessName,
    category: lead.category,
    subcategory: lead.subcategory,
    business_type: lead.businessType,
    city: lead.city,
    neighborhood: lead.neighborhood,
    street_address: lead.streetAddress,
    zip: lead.zip,
    phone: lead.phone,
    email: lead.email,
    website: lead.website,
    instagram: lead.instagram,
    tiktok: lead.tiktok,
    facebook: lead.facebook,
    youtube: lead.youtube,
    linkedin: lead.linkedin,
    other_social: lead.otherSocial,
    owner_or_contact_name: lead.contactName,
    contact_role: lead.contactRole,
    google_maps_url: lead.googleMapsUrl,
    yelp_url: lead.yelpUrl,
    rating: lead.rating,
    review_count: lead.reviewCount?.toString() ?? "",
    price_hint: lead.priceHint,
    offers_online: lead.offersOnline ? "yes" : "no",
    class_formats: lead.classFormats,
    est_size: lead.estSize,
    notes: lead.notes,
    source_urls: lead.sourceUrls,
    date_added: lead.dateAdded,
    priority: lead.priority,
    outreach_status: OUTREACH_LABELS[lead.outreachStatus as OutreachStatus] ?? lead.outreachStatus,
    last_contacted: lead.lastContacted ?? "",
    next_step: lead.nextStep,
    owner_bd_rep: (lead.assignedUserId && reps.get(lead.assignedUserId)) || "",
  }));
  return toCsv(mapped);
}

export async function importLeadCsv(text: string, repsByEmail: Map<string, string>) {
  const parsed = rowsFromCsv(text);
  if (parsed.errors.length && !parsed.rows.length) return { errors: parsed.errors, imported: 0 };
  const existing = await db.select({ id: leads.id, websiteDomain: leads.websiteDomain }).from(leads);
  const plan = planLeadImport(existing, parsed.rows);
  if (plan.errors.length) return { errors: [...parsed.errors, ...plan.errors], imported: 0 };
  for (const item of plan.plans) {
    const row = item.row;
    const assigned = repsByEmail.get(row.owner_bd_rep.toLowerCase()) ?? null;
    const values = {
      businessName: row.business_name,
      category: row.category,
      subcategory: row.subcategory,
      businessType: row.business_type,
      city: row.city,
      neighborhood: row.neighborhood,
      streetAddress: row.street_address,
      zip: row.zip,
      phone: row.phone,
      email: row.email,
      website: row.website,
      websiteDomain: websiteDomain(row.website),
      instagram: row.instagram,
      tiktok: row.tiktok,
      facebook: row.facebook,
      youtube: row.youtube,
      linkedin: row.linkedin,
      otherSocial: row.other_social,
      contactName: row.owner_or_contact_name,
      contactRole: row.contact_role,
      googleMapsUrl: row.google_maps_url,
      yelpUrl: row.yelp_url,
      rating: row.rating,
      reviewCount: row.review_count ? Number(row.review_count) : null,
      priceHint: row.price_hint,
      offersOnline: offersOnlineOf(row.offers_online),
      classFormats: row.class_formats,
      estSize: row.est_size,
      notes: row.notes,
      sourceUrls: row.source_urls,
      dateAdded: row.date_added || new Date().toISOString().slice(0, 10),
      priority: priorityOf(row.priority),
      outreachStatus: statusOf(row.outreach_status),
      lastContacted: row.last_contacted || null,
      nextStep: row.next_step,
      assignedUserId: assigned,
      updatedAt: new Date(),
    };
    if (item.action === "update") await db.update(leads).set(values).where(eq(leads.id, item.id));
    else await db.insert(leads).values({ id: item.id, ...values });
  }
  return { errors: parsed.errors, imported: plan.plans.length, warnings: plan.plans.flatMap((item) => item.warnings) };
}

export async function logLeadActivity(leadId: string, authorUserId: string, type: string, body: string) {
  const today = new Date().toISOString().slice(0, 10);
  await db.insert(leadActivities).values({ id: crypto.randomUUID(), leadId, authorUserId, type, body });
  await db.update(leads).set({ lastContacted: today, updatedAt: new Date() }).where(eq(leads.id, leadId));
}

export async function convertLead(leadId: string) {
  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
  if (!lead) return { error: "Lead not found." };
  if (!lead.email) return { error: "Add an email before converting." };
  if (lead.convertedTeacherId) return { error: "This lead is already linked to a teacher." };
  const [existing] = await db.select().from(user).where(eq(user.email, lead.email.toLowerCase())).limit(1);
  let userId = existing?.id;
  if (!userId) {
    userId = crypto.randomUUID();
    await db.insert(user).values({
      id: userId,
      name: lead.contactName || lead.businessName,
      email: lead.email.toLowerCase(),
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await db.insert(userRoles).values({ id: crypto.randomUUID(), userId, role: "student" });
  }
  const [credential] = await db
    .select({ password: account.password })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "credential")))
    .limit(1);
  let note = "Existing account linked.";
  if (!credential?.password) {
    const token = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await db.insert(verification).values({
      id: crypto.randomUUID(),
      identifier: passwordResetIdentifier(token),
      value: userId,
      expiresAt,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const mail = teacherInviteEmail({
      contactName: lead.contactName,
      businessName: lead.businessName,
      url: inviteSetPasswordUrl(appOrigin(), token),
    });
    await sendEmail({ to: [lead.email], subject: mail.subject, text: mail.text, html: mail.html });
    note = inviteActivityNote();
  }
  const [alreadyTeacher] = await db.select().from(teachers).where(eq(teachers.userId, userId)).limit(1);
  const teacherId = alreadyTeacher?.id ?? crypto.randomUUID();
  if (!alreadyTeacher) {
    await db.insert(teachers).values({
      id: teacherId,
      userId,
      slug: uniqueSlug(lead.businessName),
      studioName: lead.businessName,
      bio: lead.notes || `${lead.businessName} in ${lead.neighborhood || lead.city}.`,
      specialties: [lead.category, lead.subcategory].filter(Boolean),
      instagram: lead.instagram,
      website: lead.website,
      tiktok: lead.tiktok,
      youtube: lead.youtube,
      status: "pending",
    });
    await db.insert(userRoles).values({ id: crypto.randomUUID(), userId, role: "teacher" }).onConflictDoNothing();
  }
  await db.update(leads).set({ convertedTeacherId: teacherId, outreachStatus: "onboarding", updatedAt: new Date() }).where(eq(leads.id, lead.id));
  await logLeadActivity(lead.id, userId, "note", `Converted to a pending teacher. ${note}`);
  return { teacherId, note };
}
