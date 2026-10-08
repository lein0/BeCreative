"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActor } from "@/lib/actor";
import { db } from "@/lib/db";
import { bookings, classes, faqArticles, tickets } from "@/lib/db/schema";
import { hitRateLimit } from "@/lib/rate-limit";
import { addDisputeNote, editDisputeSummary, holdDispute, overrideLiability, submitDispute } from "@/lib/disputes";
import { assignTicket, mergeTickets, openTicket, recordCsat, replyToTicket, resolveTicket, saveCannedReply } from "@/lib/support";
import { deleteAccount } from "@/lib/account-data";
import { canManageRoles, canViewPlatformStats } from "@/lib/permissions";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function ticketAction(formData: FormData) {
  const actor = await requireActor();
  const limit = await hitRateLimit(`support:${actor.id}`, 10, 60 * 60 * 1000);
  if (!limit.ok) redirect("/help?error=Too%20many%20requests.%20Wait%20an%20hour.");
  const bookingId = text(formData, "bookingId");
  const [booking] = bookingId ? await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1) : [];
  const [klass] = booking ? await db.select().from(classes).where(eq(classes.id, booking.classId)).limit(1) : [];
  const category = text(formData, "category") || "class";
  await openTicket({
    userId: actor.id,
    teacherId: klass?.teacherId,
    bookingId: bookingId || null,
    orderId: booking?.orderId,
    category,
    subject: text(formData, "subject") || "Help with a booking",
    body: text(formData, "body"),
    priority: text(formData, "priority") || "normal",
  });
  redirect(category === "safety" ? "/help/safety?sent=1" : "/help?sent=1");
}

export async function supportReplyAction(formData: FormData) {
  const actor = await requireActor();
  const ticketId = text(formData, "ticketId");
  const command = text(formData, "command");
  if (command === "assign") {
    if (!canViewPlatformStats(actor.roles)) return;
    await assignTicket(ticketId, text(formData, "assignee") || actor.id);
  } else if (command === "merge") {
    if (!canViewPlatformStats(actor.roles)) return;
    await mergeTickets(ticketId, text(formData, "targetId"));
  } else if (command === "resolve") {
    await resolveTicket(ticketId);
  } else if (command === "csat") {
    await recordCsat(ticketId, Number(text(formData, "score") || 5));
  } else if (command === "canned") {
    if (!canViewPlatformStats(actor.roles)) return;
    await saveCannedReply(text(formData, "title"), text(formData, "cannedBody"), text(formData, "category") || "class");
  } else {
    await replyToTicket({ ticketId, authorUserId: actor.id, body: text(formData, "body"), internal: formData.get("internal") === "1", teacherSide: true });
  }
  revalidatePath("/admin/support");
  revalidatePath("/teach/support");
  redirect(text(formData, "back") || "/admin/support");
}

export async function disputeAction(formData: FormData) {
  const actor = await requireActor();
  const id = text(formData, "disputeId");
  const command = text(formData, "command");
  if (command === "hold") {
    if (!canManageRoles(actor.roles)) return;
    await holdDispute(id, actor.id);
  } else if (command === "submit") {
    if (!canManageRoles(actor.roles)) return;
    await submitDispute(id, actor.id);
  } else if (command === "edit") {
    if (!canManageRoles(actor.roles)) return;
    await editDisputeSummary(id, text(formData, "summary"), actor.id);
  } else if (command === "liability") {
    if (!canManageRoles(actor.roles)) return;
    await overrideLiability(id, text(formData, "amountBearer") || "teacher", text(formData, "feeBearer") || "platform", actor.id);
  } else {
    await addDisputeNote(id, actor.id, text(formData, "body"));
  }
  revalidatePath("/admin/disputes");
  redirect(text(formData, "back") || "/admin/disputes");
}

export async function faqAction(formData: FormData) {
  const actor = await requireActor();
  if (!canViewPlatformStats(actor.roles)) return;
  const slug = text(formData, "slug");
  const [existing] = await db.select().from(faqArticles).where(eq(faqArticles.slug, slug)).limit(1);
  const row = { title: text(formData, "title"), body: text(formData, "body"), category: text(formData, "category") || "booking", published: formData.get("published") === "1", updatedAt: new Date() };
  if (existing) await db.update(faqArticles).set(row).where(eq(faqArticles.id, existing.id));
  else await db.insert(faqArticles).values({ id: crypto.randomUUID(), slug, ...row });
  revalidatePath("/help");
  redirect("/admin/help");
}

export async function deleteAccountAction() {
  const actor = await requireActor();
  await deleteAccount(actor.id);
  redirect("/");
}

export async function teacherTicketGuard(ticketId: string, teacherId: string) {
  const [ticket] = await db.select().from(tickets).where(eq(tickets.id, ticketId)).limit(1);
  return Boolean(ticket && ticket.teacherId === teacherId);
}
