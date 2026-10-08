"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ensureAdminByEmail } from "@/lib/admins";
import { auth } from "@/lib/auth";
import { getActor, requireActor } from "@/lib/actor";
import { bookSession, cancelBooking, purchaseOffer, type ActionState } from "@/lib/booking-service";
import { bookingResultPath, errorRedirectPath, safeNextPath, studioOwnsResource } from "@/lib/checkout-rules";
import { convertLead, importLeadCsv, logLeadActivity } from "@/lib/crm";
import { LA_TIMEZONE, ROLES, type Role } from "@/lib/constants";
import { db } from "@/lib/db";
import { bookingSessions, classes, leads, leadViews, platformSettings, promoCodes, recurrences, sessions, teachers, user, userRoles } from "@/lib/db/schema";
import { canApproveTeachers, canEditTeacherContent, canManageLeads, canManagePlatformPromos, canManageRoles } from "@/lib/permissions";
import { teacherByUser } from "@/lib/queries";
import type { RecurrenceRule } from "@/lib/recurrence";
import { attachMedia, emailRoster, featureClass, manualBook, moveSession, saveClass, saveMembership, savePack, savePromo, setCheckin, setPaused, setTeacherStatus, skipSession, updateRecurrence } from "@/lib/studio-service";
import { geocoder } from "@/lib/geocode";
import { uniqueSlug } from "@/lib/utils";
import { bookVisit, cancelVisit, saveCredential, saveService, saveWaiver, signWaiver, verifyCredential } from "@/lib/wellness-service";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function authFailure(error: unknown, fallback: string) {
  const status = error && typeof error === "object" && "status" in error ? Number(error.status) : 0;
  const message = error instanceof Error ? error.message : "";
  if (status === 429 || /too many/i.test(message)) return "Too many attempts. Wait a minute and try again.";
  return fallback;
}

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const next = text(formData, "next") || "/explore";
  const email = text(formData, "email");
  try {
    const result = await auth.api.signInEmail({
      body: { email, password: text(formData, "password") },
      headers: await headers(),
    });
    if (!result) return { error: "Check the email and password." };
    await ensureAdminByEmail(email);
  } catch (error) {
    return { error: authFailure(error, "Check the email and password.") };
  }
  redirect(safeNextPath(next));
}

export async function signupAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = text(formData, "email");
  try {
    await auth.api.signUpEmail({
      body: { email, password: text(formData, "password"), name: text(formData, "name") },
      headers: await headers(),
    });
    await ensureAdminByEmail(email);
  } catch (error) {
    return { error: authFailure(error, "Could not create the account.") };
  }
  redirect("/verify-email");
}

export async function resetPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const password = text(formData, "password");
  const confirm = text(formData, "confirm");
  if (password.length < 8) return { error: "Use at least 8 characters." };
  if (password !== confirm) return { error: "Those passwords do not match." };
  try {
    await auth.api.resetPassword({
      body: { newPassword: password, token: text(formData, "token") },
      headers: await headers(),
    });
  } catch (error) {
    return { error: authFailure(error, "That reset link is invalid or expired.") };
  }
  redirect("/login");
}

export async function bookAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  const slug = text(formData, "slug");
  if (formData.get("policyAccepted") !== "1") redirect(errorRedirectPath(`/c/${slug}`, "Accept the cancellation policy to book."));
  const result = await bookSession({
    userId: actor.id,
    email: actor.email,
    name: actor.name,
    sessionId: text(formData, "sessionId") || undefined,
    classId: text(formData, "classId") || undefined,
    series: formData.get("series") === "1",
    code: text(formData, "code"),
    payWith: text(formData, "payWith") || "cash",
    policyAccepted: true,
    ip: clientIp(await headers()),
  });
  redirect(bookingResultPath({ ...result, slug }));
}

export async function cancelBookingAction(formData: FormData) {
  const actor = await requireActor();
  await cancelBooking(actor.id, text(formData, "bookingId"));
  revalidatePath("/bookings");
}

export async function buyOfferAction(formData: FormData) {
  const actor = await requireActor();
  const result = await purchaseOffer({
    userId: actor.id,
    email: actor.email,
    kind: text(formData, "kind") === "membership" ? "membership" : "pack",
    id: text(formData, "id"),
    code: text(formData, "code"),
  });
  if (result.error) redirect(errorRedirectPath(text(formData, "back"), result.error));
  if (result.checkoutUrl) redirect(result.checkoutUrl);
  redirect("/bookings?offer=1");
}

export async function createClassAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const teacherId = text(formData, "teacherId");
  const [teacher] = await db.select().from(teachers).where(eq(teachers.id, teacherId)).limit(1);
  if (!teacher || !canEditTeacherContent(actor.roles, teacher.userId === actor.id)) return { error: "You can't edit this studio." };
  const mode = text(formData, "scheduleMode");
  let schedule: { mode: "once"; date: string; time: string } | { mode: "repeat"; rule: RecurrenceRule } | null = null;
  if (mode === "once") schedule = { mode: "once", date: text(formData, "onceDate"), time: text(formData, "onceTime") || "19:00" };
  if (mode === "repeat") {
    const rule = JSON.parse(text(formData, "rule") || "{}") as RecurrenceRule;
    if (!rule.days?.length) return { error: "Pick at least one day." };
    schedule = { mode: "repeat", rule: { ...rule, timezone: LA_TIMEZONE } };
  }
  const dollars = (key: string) => {
    const raw = text(formData, key);
    if (!raw) return null;
    return Math.round(Number(raw) * 100);
  };
  const saved = await saveClass({
    actorUserId: actor.id,
    teacherId,
    delegated: teacher.userId !== actor.id,
    title: text(formData, "title"),
    description: text(formData, "description"),
    outcomes: text(formData, "outcomes"),
    prerequisites: text(formData, "prerequisites"),
    whatToBring: text(formData, "whatToBring"),
    categoryId: text(formData, "categoryId"),
    subcategoryId: text(formData, "subcategoryId"),
    skillLevel: text(formData, "skillLevel") || "all_levels",
    format: text(formData, "format") || "drop_in",
    delivery: text(formData, "delivery") || "in_person",
    virtualLink: text(formData, "virtualLink"),
    maxSize: Number(text(formData, "maxSize") || 12),
    durationMinutes: Number(text(formData, "duration") || 60),
    pricePerSessionCents: dollars("priceSession"),
    pricePerSeriesCents: dollars("priceSeries"),
    seriesBookingEnabled: formData.get("seriesBooking") === "on",
    firstClassFree: formData.get("firstFree") === "on",
    waitlistEnabled: formData.get("waitlist") === "on",
    classId: text(formData, "classId") || undefined,
    publish: formData.get("publish") === "on",
    venueName: text(formData, "venue"),
    address: text(formData, "address"),
    neighborhood: text(formData, "neighborhood"),
    city: text(formData, "city") || "Los Angeles",
    postalCode: text(formData, "zip"),
    schedule: mode ? schedule : null,
  });
  if ("error" in saved && saved.error) return { error: saved.error };
  redirect(teacher.userId === actor.id ? `/teach/classes/${saved.classId}` : `/manage/teachers/${teacher.id}/classes/${saved.classId}`);
}

export async function onboardingAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const [existing] = await db.select().from(teachers).where(eq(teachers.userId, actor.id)).limit(1);
  if (existing) redirect("/teach");
  const id = crypto.randomUUID();
  await db.insert(teachers).values({
    id,
    userId: actor.id,
    slug: uniqueSlug(text(formData, "studio") || actor.name),
    studioName: text(formData, "studio"),
    bio: text(formData, "bio"),
    specialties: text(formData, "specialties").split(",").map((item) => item.trim()).filter(Boolean),
    instagram: text(formData, "instagram"),
    website: text(formData, "website"),
    tiktok: text(formData, "tiktok"),
    youtube: text(formData, "youtube"),
    status: "pending",
  });
  await db.insert(userRoles).values({ id: crypto.randomUUID(), userId: actor.id, role: "teacher" }).onConflictDoNothing();
  redirect("/teach/classes/new?welcome=1");
}

export async function scheduleCommandAction(formData: FormData) {
  const actor = await requireActor();
  const teacherId = text(formData, "teacherId");
  const [teacher] = await db.select().from(teachers).where(eq(teachers.id, teacherId)).limit(1);
  if (!teacher || !canEditTeacherContent(actor.roles, teacher.userId === actor.id)) return;
  const delegated = teacher.userId !== actor.id;
  const command = text(formData, "command");
  if (command === "pause" || command === "resume") {
    const recurrenceId = text(formData, "recurrenceId");
    if (!(await teacherOwnsRecurrence(recurrenceId, teacherId))) return;
    await setPaused(recurrenceId, command === "pause", actor.id, delegated, teacherId);
  }
  if (command === "skip") {
    const sessionId = text(formData, "sessionId");
    if (!(await teacherOwnsSession(sessionId, teacherId))) return;
    await skipSession(sessionId, actor.id, delegated, teacherId);
  }
  if (command === "move") {
    const sessionId = text(formData, "sessionId");
    if (!(await teacherOwnsSession(sessionId, teacherId))) return;
    await moveSession(sessionId, text(formData, "date"), text(formData, "time"), actor.id, delegated, teacherId);
  }
  if (command === "reshape") {
    const recurrenceId = text(formData, "recurrenceId");
    if (!(await teacherOwnsRecurrence(recurrenceId, teacherId))) return;
    const rule = JSON.parse(text(formData, "rule") || "{}") as RecurrenceRule;
    if (rule.days?.length) await updateRecurrence(recurrenceId, { ...rule, timezone: LA_TIMEZONE }, actor.id, delegated, teacherId);
  }
  revalidatePath("/teach");
}

async function teacherOwnsSession(sessionId: string, teacherId: string) {
  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
  if (!session) return false;
  const [klass] = await db.select().from(classes).where(eq(classes.id, session.classId)).limit(1);
  return studioOwnsResource(klass?.teacherId, teacherId);
}

async function teacherOwnsRecurrence(recurrenceId: string, teacherId: string) {
  const [rule] = await db.select().from(recurrences).where(eq(recurrences.id, recurrenceId)).limit(1);
  if (!rule) return false;
  const [klass] = await db.select().from(classes).where(eq(classes.id, rule.classId)).limit(1);
  return studioOwnsResource(klass?.teacherId, teacherId);
}

async function teacherForBookingLink(linkId: string) {
  const [link] = await db.select().from(bookingSessions).where(eq(bookingSessions.id, linkId)).limit(1);
  if (!link) return null;
  const [session] = await db.select().from(sessions).where(eq(sessions.id, link.sessionId)).limit(1);
  if (!session) return null;
  const [klass] = await db.select().from(classes).where(eq(classes.id, session.classId)).limit(1);
  if (!klass) return null;
  const [teacher] = await db.select().from(teachers).where(eq(teachers.id, klass.teacherId)).limit(1);
  return teacher ?? null;
}

async function teacherForRoster(sessionId: string, classId: string) {
  const classIdToUse = sessionId
    ? (await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1))[0]?.classId
    : classId;
  if (!classIdToUse) return null;
  const [klass] = await db.select().from(classes).where(eq(classes.id, classIdToUse)).limit(1);
  if (!klass) return null;
  const [teacher] = await db.select().from(teachers).where(eq(teachers.id, klass.teacherId)).limit(1);
  return teacher ?? null;
}

export async function rosterAction(formData: FormData) {
  const actor = await requireActor();
  const command = text(formData, "command");
  if (command === "checkin") {
    const teacher = await teacherForBookingLink(text(formData, "linkId"));
    if (!teacher || !canEditTeacherContent(actor.roles, teacher.userId === actor.id)) return;
    await setCheckin(text(formData, "linkId"), formData.get("checked") === "1", teacher.id);
  }
  if (command === "manual") {
    const [klass] = await db.select().from(classes).where(eq(classes.id, text(formData, "classId"))).limit(1);
    if (!klass) return;
    const [teacher] = await db.select().from(teachers).where(eq(teachers.id, klass.teacherId)).limit(1);
    if (!teacher || !canEditTeacherContent(actor.roles, teacher.userId === actor.id)) return;
    const result = await manualBook({
      classId: klass.id,
      sessionId: text(formData, "sessionId"),
      teacherId: teacher.id,
      name: text(formData, "name"),
      email: text(formData, "email"),
      payment: (text(formData, "payment") as "paid" | "pay_at_studio" | "unpaid") || "pay_at_studio",
      override: formData.get("override") === "on",
      actorUserId: actor.id,
      delegated: teacher.userId !== actor.id,
    });
    if (result?.error) redirect(`/teach/sessions/${text(formData, "sessionId")}?error=${encodeURIComponent(result.error)}`);
  }
  if (command === "email") {
    const teacher = await teacherForRoster(text(formData, "sessionId"), text(formData, "classId"));
    if (!teacher || !canEditTeacherContent(actor.roles, teacher.userId === actor.id)) return;
    const result = await emailRoster({
      sessionId: text(formData, "sessionId") || undefined,
      classId: text(formData, "classId") || undefined,
      includePast: formData.get("includePast") === "on",
      subject: text(formData, "subject"),
      body: text(formData, "body"),
      teacherId: teacher.id,
    });
    if (result && "error" in result && result.error) redirect(errorRedirectPath(text(formData, "back"), result.error, "/teach"));
  }
  revalidatePath("/teach");
}

export async function pricingAction(formData: FormData) {
  const actor = await requireActor();
  const teacherId = text(formData, "teacherId");
  const [teacher] = await db.select().from(teachers).where(eq(teachers.id, teacherId)).limit(1);
  if (!teacher || !canEditTeacherContent(actor.roles, teacher.userId === actor.id)) return;
  const delegated = teacher.userId !== actor.id;
  if (text(formData, "kind") === "pack") {
    await savePack({
      teacherId,
      name: text(formData, "name"),
      creditCount: Number(text(formData, "credits") || 5),
      priceCents: Math.round(Number(text(formData, "price") || 0) * 100),
      expiryDays: Number(text(formData, "expiry") || 90),
      classIds: formData.getAll("classId").map(String),
      description: text(formData, "description"),
      actorUserId: actor.id,
      delegated,
    });
  } else if (text(formData, "kind") === "membership") {
    await saveMembership({
      teacherId,
      name: text(formData, "name"),
      termMonths: Number(text(formData, "term") || 1),
      kind: text(formData, "cap") === "unlimited" ? "unlimited" : "capped",
      classesPerPeriod: text(formData, "cap") === "unlimited" ? null : Number(text(formData, "perPeriod") || 4),
      priceCents: Math.round(Number(text(formData, "price") || 0) * 100),
      recurring: formData.get("recurring") === "on",
      policy: text(formData, "policy") || "Cancel anytime before the next renewal. Pause up to 30 days.",
      classIds: formData.getAll("classId").map(String),
      actorUserId: actor.id,
      delegated,
    });
  } else {
    await savePromo({
      teacherId,
      code: text(formData, "code"),
      discountType: text(formData, "discountType") === "fixed" ? "fixed" : "percent",
      percentOffBps: Math.round(Number(text(formData, "percent") || 0) * 100),
      amountOffCents: Math.round(Number(text(formData, "amount") || 0) * 100),
      appliesTo: text(formData, "appliesTo") || "all",
      funding: "teacher",
      platformSharePercent: 0,
      maxRedemptions: text(formData, "max") ? Number(text(formData, "max")) : null,
      maxPerCustomer: text(formData, "perCustomer") ? Number(text(formData, "perCustomer")) : 1,
      firstTimeOnly: formData.get("firstTime") === "on",
      minPurchaseCents: Math.round(Number(text(formData, "minimum") || 0) * 100),
      classIds: formData.getAll("classId").map(String),
      actorUserId: actor.id,
      delegated,
    });
  }
  revalidatePath("/teach/pricing");
  revalidatePath("/teach/promos");
}

export async function adminPromoAction(formData: FormData) {
  const actor = await requireActor();
  if (!canManagePlatformPromos(actor.roles)) return;
  if (text(formData, "command") === "deactivate") {
    await db.update(promoCodes).set({ active: false }).where(eq(promoCodes.id, text(formData, "id")));
  } else {
    await savePromo({
      teacherId: null,
      code: text(formData, "code"),
      discountType: "percent",
      percentOffBps: Math.round(Number(text(formData, "percent") || 15) * 100),
      amountOffCents: 0,
      appliesTo: "all",
      funding: text(formData, "funding") || "platform",
      platformSharePercent: text(formData, "funding") === "split" ? Number(text(formData, "share") || 50) : text(formData, "funding") === "teacher" ? 0 : 100,
      maxRedemptions: null,
      maxPerCustomer: 1,
      firstTimeOnly: false,
      minPurchaseCents: 0,
      classIds: [],
      actorUserId: actor.id,
      delegated: false,
    });
  }
  revalidatePath("/admin/promos");
}

export async function approveTeacherAction(formData: FormData) {
  const actor = await requireActor();
  if (!canApproveTeachers(actor.roles)) return;
  await setTeacherStatus(text(formData, "teacherId"), text(formData, "status") === "rejected" ? "rejected" : "approved", text(formData, "reason"));
  revalidatePath("/admin/teachers");
}

export async function featureAction(formData: FormData) {
  const actor = await requireActor();
  if (!canApproveTeachers(actor.roles)) return;
  await featureClass(text(formData, "classId"), formData.get("featured") === "1");
  revalidatePath("/admin/classes");
}

export async function feeAction(formData: FormData) {
  const actor = await requireActor();
  if (!canManageRoles(actor.roles)) return;
  await db.update(platformSettings).set({ feePercent: Number(text(formData, "percent") || 10), feeFixedCents: Math.round(Number(text(formData, "fixed") || 0) * 100), updatedAt: new Date(), updatedBy: actor.id }).where(eq(platformSettings.id, 1));
  revalidatePath("/admin/settings");
}

export async function roleAction(formData: FormData) {
  const actor = await requireActor();
  if (!canManageRoles(actor.roles)) return;
  const userId = text(formData, "userId");
  if (userId === actor.id && !formData.getAll("role").includes("admin")) return;
  await db.delete(userRoles).where(eq(userRoles.userId, userId));
  const chosen = formData.getAll("role").map(String).filter((role): role is Role => ROLES.includes(role as Role));
  for (const role of chosen.length ? chosen : ["student"]) {
    await db.insert(userRoles).values({ id: crypto.randomUUID(), userId, role });
  }
  revalidatePath("/admin/users");
}

export async function leadAction(formData: FormData) {
  const actor = await requireActor();
  if (!canManageLeads(actor.roles)) return;
  const command = text(formData, "command");
  if (command === "activity") await logLeadActivity(text(formData, "leadId"), actor.id, text(formData, "type") || "note", text(formData, "body"));
  if (command === "status") await db.update(leads).set({ outreachStatus: text(formData, "status"), updatedAt: new Date() }).where(eq(leads.id, text(formData, "leadId")));
  if (command === "convert") {
    const converted = await convertLead(text(formData, "leadId"));
    if ("error" in converted && converted.error) redirect(errorRedirectPath(`/crm/${text(formData, "leadId")}`, converted.error, "/crm"));
  }
  if (command === "import") {
    const file = formData.get("file");
    if (!(file instanceof File)) return;
    const people = await db.select().from(user);
    const reps = new Map(people.map((person) => [person.email.toLowerCase(), person.id]));
    await importLeadCsv(await file.text(), reps);
  }
  if (command === "due") await db.update(leads).set({ nextStep: text(formData, "nextStep"), nextStepDue: text(formData, "due") || null, updatedAt: new Date() }).where(eq(leads.id, text(formData, "leadId")));
  if (command === "save-view") {
    await db.insert(leadViews).values({
      id: crypto.randomUUID(),
      userId: actor.id,
      name: text(formData, "name") || "Saved view",
      filters: {
        q: text(formData, "q"),
        city: text(formData, "city"),
        category: text(formData, "category"),
        status: text(formData, "status"),
        priority: text(formData, "priority"),
        rep: text(formData, "rep"),
      },
    });
  }
  revalidatePath("/crm");
}

export async function forgotAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await auth.api.requestPasswordReset({
      body: { email: text(formData, "email"), redirectTo: "/reset" },
      headers: await headers(),
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not send the reset email." };
  }
  return { ok: "If that email has an account, a reset link is on its way." };
}

export async function mediaAction(formData: FormData) {
  const actor = await requireActor();
  const classId = text(formData, "classId");
  const [klass] = await db.select().from(classes).where(eq(classes.id, classId)).limit(1);
  if (!klass) return;
  const [teacher] = await db.select().from(teachers).where(eq(teachers.id, klass.teacherId)).limit(1);
  if (!teacher || !canEditTeacherContent(actor.roles, teacher.userId === actor.id)) return;
  const url = text(formData, "url");
  if (!url) return;
  await attachMedia(classId, url, text(formData, "type") === "video" ? "video" : "image");
  revalidatePath(`/teach/classes/${classId}`);
}

export async function geocodePreview(address: string) {
  const actor = await getActor();
  if (!actor) return null;
  return geocoder().geocode(address);
}

function num(formData: FormData, key: string, fallback = 0) {
  const value = Number(text(formData, key));
  return Number.isFinite(value) ? value : fallback;
}

function clientIp(headerStore: Headers) {
  return headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() || headerStore.get("x-real-ip") || null;
}

export async function bookVisitAction(formData: FormData) {
  const actor = await requireActor();
  const slug = text(formData, "slug");
  const addonIds = formData.getAll("addonId").map(String).filter(Boolean);
  if (formData.get("policyAccepted") !== "1") redirect(`/s/${slug}?error=${encodeURIComponent("Accept the cancellation policy to book.")}`);
  const result = await bookVisit({
    userId: actor.id,
    email: actor.email,
    serviceId: text(formData, "serviceId"),
    optionId: text(formData, "optionId") || undefined,
    addonIds,
    startsAt: text(formData, "startsAt"),
    code: text(formData, "code"),
    payWith: text(formData, "payWith") || "cash",
    policyAccepted: true,
    ip: clientIp(await headers()),
  });
  if ("error" in result && result.error) redirect(`/s/${slug}?error=${encodeURIComponent(result.error)}`);
  if ("checkoutUrl" in result && result.checkoutUrl) redirect(result.checkoutUrl);
  redirect("/bookings?reserved=1");
}

export async function signWaiverAction(formData: FormData) {
  const actor = await requireActor();
  const slug = text(formData, "slug");
  const result = await signWaiver({
    teacherId: text(formData, "teacherId"),
    userId: actor.id,
    signedName: text(formData, "signedName"),
    ip: clientIp(await headers()),
  });
  if (result.error) redirect(`/s/${slug}?error=${encodeURIComponent(result.error)}`);
  redirect(`/s/${slug}?signed=1`);
}

export async function cancelVisitAction(formData: FormData) {
  const actor = await requireActor();
  const result = await cancelVisit(actor.id, text(formData, "visitId"));
  if (result.error) redirect(`/bookings?error=${encodeURIComponent(result.error)}`);
  revalidatePath("/bookings");
}

export async function saveServiceAction(formData: FormData) {
  const actor = await requireActor();
  const teacher = await teacherByUser(actor.id);
  if (!teacher || !canEditTeacherContent(actor.roles, true)) redirect("/teach");
  let parsed: { weekday: number; start: string; end: string }[] = [];
  try {
    parsed = JSON.parse(text(formData, "windows") || "[]") as { weekday: number; start: string; end: string }[];
  } catch {
    parsed = [];
  }
  const windows = parsed.filter((window) => window.weekday >= 0 && window.weekday <= 6 && /^\d{2}:\d{2}$/.test(window.start) && /^\d{2}:\d{2}$/.test(window.end));
  const kind = text(formData, "kind") === "access" ? "access" : "appointment";
  const options = kind === "appointment"
    ? [
        { label: `${num(formData, "minutesA", 60)} min`, minutes: num(formData, "minutesA", 60), priceCents: Math.round(num(formData, "priceA") * 100) },
        { label: `${num(formData, "minutesB", 90)} min`, minutes: num(formData, "minutesB", 90), priceCents: Math.round(num(formData, "priceB") * 100) },
      ].filter((option) => option.minutes > 0 && option.priceCents > 0)
    : [];
  const addons = [1, 2].map((index) => ({
    name: text(formData, `addonName${index}`),
    priceCents: Math.round(num(formData, `addonPrice${index}`) * 100),
    minutes: num(formData, `addonMinutes${index}`),
  })).filter((addon) => addon.name);
  if (!text(formData, "title") || !text(formData, "categoryId") || !windows.length) redirect("/teach/services/new?error=Add%20a%20title%2C%20category%2C%20and%20hours");
  if (kind === "appointment" && !options.length) redirect("/teach/services/new?error=Add%20a%20duration%20and%20price");
  const saved = await saveService({
    teacherId: teacher.id,
    title: text(formData, "title"),
    description: text(formData, "description"),
    categoryId: text(formData, "categoryId"),
    kind,
    bufferMinutes: num(formData, "bufferMinutes", 15),
    leadTimeHours: num(formData, "leadTimeHours", 2),
    cancellationHours: num(formData, "cancellationHours", 24),
    slotMinutes: kind === "access" ? num(formData, "slotMinutes", 45) : null,
    capacity: num(formData, "capacity", 6),
    priceCents: Math.round(num(formData, "accessPrice") * 100),
    waiverRequired: formData.get("waiverRequired") === "1",
    publish: formData.get("publish") === "1",
    windows,
    options,
    addons,
    location: { name: text(formData, "place"), address: text(formData, "address"), neighborhood: text(formData, "neighborhood") || "Silver Lake", city: "Los Angeles" },
  });
  revalidatePath("/teach");
  redirect(`/teach/services/${saved.id}`);
}

export async function saveWaiverAction(formData: FormData) {
  const actor = await requireActor();
  const teacher = await teacherByUser(actor.id);
  if (!teacher) redirect("/teach/onboarding");
  const result = await saveWaiver(teacher.id, text(formData, "body"));
  if (result.error) redirect(`/teach/waiver?error=${encodeURIComponent(result.error)}`);
  revalidatePath("/teach/waiver");
  redirect("/teach/waiver?saved=1");
}

export async function saveCredentialAction(formData: FormData) {
  const actor = await requireActor();
  const teacher = await teacherByUser(actor.id);
  if (!teacher) redirect("/teach/onboarding");
  const result = await saveCredential({ teacherId: teacher.id, label: text(formData, "label"), identifier: text(formData, "identifier") });
  if ("error" in result && result.error) redirect(`/teach/credentials?error=${encodeURIComponent(result.error)}`);
  revalidatePath("/teach/credentials");
  redirect("/teach/credentials");
}

export async function verifyCredentialAction(formData: FormData) {
  const actor = await requireActor();
  if (!canApproveTeachers(actor.roles)) redirect("/admin");
  await verifyCredential(text(formData, "credentialId"), text(formData, "verified") === "1", actor.id);
  revalidatePath("/admin/teachers");
}

export async function teacherCancelAction(formData: FormData) {
  const actor = await requireActor();
  const { teacherCancelSession, teacherCancelUpcoming } = await import("@/lib/cancellations");
  const { loadTeacherAccess } = await import("@/lib/actor");
  const back = text(formData, "back") || "/teach";
  const classId = text(formData, "classId");
  const [klass] = await db.select().from(classes).where(eq(classes.id, classId)).limit(1);
  if (!klass) redirect(back);
  const access = await loadTeacherAccess(klass.teacherId);
  if (!access) redirect(back);
  const reason = text(formData, "reason");
  const wantCredit = formData.get("wantCredit") === "1";
  if (formData.get("mass") === "1") {
    await teacherCancelUpcoming({ classId: text(formData, "classId"), actorUserId: actor.id, reason, wantCredit });
    redirect(`${back}?cancelled=series`);
  }
  const result = await teacherCancelSession({ sessionId: text(formData, "sessionId"), actorUserId: actor.id, reason, wantCredit });
  if ("error" in result && result.error) redirect(`${back}?error=${encodeURIComponent(result.error)}`);
  redirect(`${back}?cancelled=1`);
}

export async function teacherCancelVisitAction(formData: FormData) {
  const actor = await requireActor();
  const { teacherCancelVisit } = await import("@/lib/cancellations");
  const { visitBookings, services } = await import("@/lib/db/schema");
  const { loadTeacherAccess } = await import("@/lib/actor");
  const back = text(formData, "back") || "/teach";
  const [visit] = await db.select().from(visitBookings).where(eq(visitBookings.id, text(formData, "visitId"))).limit(1);
  const [service] = visit ? await db.select().from(services).where(eq(services.id, visit.serviceId)).limit(1) : [];
  if (!service) redirect(back);
  const access = await loadTeacherAccess(service.teacherId);
  if (!access) redirect(back);
  const result = await teacherCancelVisit({ visitId: text(formData, "visitId"), actorUserId: actor.id, reason: text(formData, "reason"), wantCredit: formData.get("wantCredit") === "1" });
  if ("error" in result && result.error) redirect(`${back}?error=${encodeURIComponent(result.error)}`);
  redirect(back);
}

export async function connectAction() {
  const actor = await requireActor();
  const teacher = await teacherByUser(actor.id);
  if (!teacher) redirect("/teach/onboarding");
  const { startConnectOnboarding } = await import("@/lib/stripe-connect");
  const result = await startConnectOnboarding({ teacherId: teacher.id, email: actor.email, studioName: teacher.studioName || actor.name });
  if (result.url) redirect(result.url);
  redirect(`/teach/billing?error=${encodeURIComponent(result.error || "Connect is unavailable.")}`);
}

export async function policySettingsAction(formData: FormData) {
  const actor = await requireActor();
  if (!canManageRoles(actor.roles)) return;
  const dollars = (key: string) => Math.round(Number(text(formData, key) || 0) * 100);
  await db.update(platformSettings).set({
    studentFullRefundHours: Number(text(formData, "fullRefundHours") || 24),
    studentCreditOnlyHours: Number(text(formData, "creditOnlyHours") || 2),
    lateCancelFeeCents: dollars("lateCancelFee"),
    noShowFeeCents: dollars("noShowFee"),
    creditRequiresOptIn: formData.get("creditRequiresOptIn") === "1",
    waitlistClaimHours: Number(text(formData, "waitlistClaimHours") || 4),
    quietHoursStart: text(formData, "quietHoursStart") || "21:00",
    quietHoursEnd: text(formData, "quietHoursEnd") || "08:00",
    disputeAutoSubmit: formData.get("disputeAutoSubmit") === "1",
    disputeSubmitLeadHours: Number(text(formData, "disputeSubmitLeadHours") || 48),
    disputeFeeBearer: text(formData, "disputeFeeBearer") || "platform",
    disputedAmountBearer: text(formData, "disputedAmountBearer") || "teacher",
    earlyFraudRefundMaxCents: dollars("earlyFraudRefundMax"),
    statementDescriptorPrefix: text(formData, "statementDescriptorPrefix") || "BECREATIVE",
    ticketTeacherSlaHours: Number(text(formData, "ticketTeacherSlaHours") || 24),
    webPushEnabled: formData.get("webPushEnabled") === "1",
    mailingAddress: text(formData, "mailingAddress") || "BeCreative, Los Angeles, CA",
    policyVersion: Number(text(formData, "policyVersion") || 1),
    updatedAt: new Date(),
    updatedBy: actor.id,
  }).where(eq(platformSettings.id, 1));
  revalidatePath("/admin/settings");
}

export async function adminRefundAction(formData: FormData) {
  const actor = await requireActor();
  if (!canManageRoles(actor.roles)) redirect("/admin");
  const { issueRefund } = await import("@/lib/refunds");
  const dollars = Math.round(Number(text(formData, "amount") || 0) * 100);
  const result = await issueRefund({
    orderId: text(formData, "orderId"),
    amountCents: formData.get("full") === "1" ? undefined : dollars,
    reasonCode: text(formData, "reason") || "admin_goodwill",
    actorUserId: actor.id,
    scope: `admin:${crypto.randomUUID()}`,
  });
  if ("error" in result && result.error) redirect(`/admin/refunds?error=${encodeURIComponent(result.error)}`);
  revalidatePath("/admin/refunds");
  redirect("/admin/refunds?ok=1");
}

export async function notificationPrefAction(formData: FormData) {
  const actor = await requireActor();
  const { notificationPreferences, user } = await import("@/lib/db/schema");
  const { and } = await import("drizzle-orm");
  const event = text(formData, "event");
  const row = {
    email: formData.get("email") === "1",
    inApp: formData.get("inApp") === "1",
    sms: formData.get("sms") === "1",
    push: formData.get("push") === "1",
    cadence: text(formData, "cadence") === "daily" ? "daily" : "instant",
  };
  const [existing] = await db.select().from(notificationPreferences).where(and(eq(notificationPreferences.userId, actor.id), eq(notificationPreferences.event, event))).limit(1);
  if (existing) await db.update(notificationPreferences).set(row).where(eq(notificationPreferences.id, existing.id));
  else await db.insert(notificationPreferences).values({ id: crypto.randomUUID(), userId: actor.id, event, ...row });
  await db.update(user).set({ creditOptIn: formData.get("creditOptIn") === "1" }).where(eq(user.id, actor.id));
  revalidatePath("/settings/notifications");
}

export async function markNotificationsAction(formData: FormData) {
  const actor = await requireActor();
  const { markNotificationsRead } = await import("@/lib/notifications");
  await markNotificationsRead(actor.id, text(formData, "id") || undefined);
  revalidatePath("/notifications");
}

export async function followAction(formData: FormData) {
  const actor = await requireActor();
  const { follows, teachers } = await import("@/lib/db/schema");
  const teacherId = text(formData, "teacherId");
  const [teacher] = await db.select().from(teachers).where(eq(teachers.id, teacherId)).limit(1);
  if (!teacher) return;
  const inserted = await db.insert(follows).values({ id: crypto.randomUUID(), userId: actor.id, teacherId }).onConflictDoNothing().returning();
  if (!inserted.length) redirect(`/t/${text(formData, "slug")}?followed=1`);
  const { emitNotification } = await import("@/lib/notifications");
  await emitNotification({
    userId: teacher.userId,
    event: "signup.followed",
    audience: "teacher",
    title: `${actor.name} followed your studio`,
    body: "A student asked to hear about new classes.",
    href: `/t/${teacher.slug}`,
  });
  redirect(`/t/${text(formData, "slug")}?followed=1`);
}
