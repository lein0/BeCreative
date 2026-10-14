"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getActor, requireActor } from "@/lib/actor";
import { db } from "@/lib/db";
import { bookings, classes, disputes, faqArticles, teachers, tickets } from "@/lib/db/schema";
import { hitRateLimit } from "@/lib/rate-limit";
import { errorRedirectPath } from "@/lib/checkout-rules";
import { addDisputeNote, editDisputeSummary, holdDispute, overrideLiability, submitDispute } from "@/lib/disputes";
import { assignTicket, mergeTickets, openTicket, recordCsat, replyToTicket, resolveTicket, saveCannedReply } from "@/lib/support";
import { deleteAccount } from "@/lib/account-data";
import { canManageRoles, canViewPlatformStats } from "@/lib/permissions";
import { canAddDisputeNote, ticketCommandAllowed } from "@/lib/support-access";
import { safetyDraftLoginPath, TICKET_DRAFT_COOKIE, ticketDraftFromFields } from "@/lib/ticket-draft";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function ticketAction(formData: FormData) {
  const actor = await getActor();
  if (!actor) {
    const draft = ticketDraftFromFields({
      category: text(formData, "category"),
      subject: text(formData, "subject"),
      body: text(formData, "body"),
      bookingId: text(formData, "bookingId"),
      priority: text(formData, "priority"),
    });
    if (draft.category === "safety" && draft.subject && draft.body) {
      const jar = await cookies();
      jar.set(TICKET_DRAFT_COOKIE, JSON.stringify(draft), { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 30 });
      redirect(safetyDraftLoginPath());
    }
    redirect("/login?next=%2Fhelp");
  }
  const limit = await hitRateLimit(`support:${actor.id}`, 10, 60 * 60 * 1000);
  if (!limit.ok) redirect("/help?error=Too%20many%20requests.%20Wait%20an%20hour.");
  const bookingId = text(formData, "bookingId");
  const [booking] = bookingId ? await db.select().from(bookings).where(and(eq(bookings.id, bookingId), eq(bookings.userId, actor.id))).limit(1) : [];
  if (bookingId && (!booking || booking.userId !== actor.id)) redirect("/help?error=That%20booking%20is%20not%20on%20your%20account.");
  const [klass] = booking ? await db.select().from(classes).where(eq(classes.id, booking.classId)).limit(1) : [];
  const category = text(formData, "category") || "class";
  const opened = await openTicket({
    userId: actor.id,
    teacherId: klass?.teacherId,
    bookingId: bookingId || null,
    orderId: booking?.orderId,
    category,
    subject: text(formData, "subject") || "Help with a booking",
    body: text(formData, "body"),
    priority: text(formData, "priority") || "normal",
  });
  redirect(`/help/tickets/${opened.id}`);
}

export async function supportReplyAction(formData: FormData) {
  const actor = await requireActor();
  const ticketId = text(formData, "ticketId");
  const command = text(formData, "command");
  const [teacher] = await db.select({ id: teachers.id }).from(teachers).where(eq(teachers.userId, actor.id)).limit(1);
  const [ticket] = ticketId ? await db.select().from(tickets).where(eq(tickets.id, ticketId)).limit(1) : [];
  if (command !== "canned" && !ticket) return;
  const isTicketTeacher = Boolean(teacher && ticket && (await teacherTicketGuard(ticket.id, teacher.id)));
  const allowed = ticketCommandAllowed(
    {
      isAdmin: canViewPlatformStats(actor.roles),
      isTicketTeacher,
      isOwner: Boolean(ticket && ticket.userId === actor.id),
      resolved: ticket?.status === "resolved",
    },
    command,
    formData.get("internal") === "1",
  );
  if (!allowed) return;
  if (command === "assign") {
    await assignTicket(ticketId, text(formData, "assignee") || actor.id);
  } else if (command === "merge") {
    const merged = await mergeTickets(ticketId, text(formData, "targetId"));
    if (!merged.ok) redirect(errorRedirectPath(text(formData, "back") || "/admin/support", "Those tickets can't be merged."));
  } else if (command === "resolve") {
    await resolveTicket(ticketId);
  } else if (command === "csat") {
    await recordCsat(ticketId, Number(text(formData, "score") || 5));
  } else if (command === "canned") {
    await saveCannedReply(text(formData, "title"), text(formData, "cannedBody"), text(formData, "category") || "class");
  } else {
    await replyToTicket({ ticketId, authorUserId: actor.id, body: text(formData, "body"), internal: formData.get("internal") === "1", teacherSide: true });
  }
  revalidatePath("/admin/support");
  revalidatePath("/teach/support");
  if (ticketId) revalidatePath(`/help/tickets/${ticketId}`);
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
    const result = await submitDispute(id, actor.id);
    if (!result.ok) redirect(errorRedirectPath(text(formData, "back") || "/admin/disputes", result.error || "Stripe did not accept the evidence."));
  } else if (command === "edit") {
    if (!canManageRoles(actor.roles)) return;
    await editDisputeSummary(id, text(formData, "summary"), actor.id);
  } else if (command === "liability") {
    if (!canManageRoles(actor.roles)) return;
    await overrideLiability(id, text(formData, "amountBearer") || "teacher", text(formData, "feeBearer") || "platform", actor.id);
  } else {
    const [teacher] = await db.select({ id: teachers.id }).from(teachers).where(eq(teachers.userId, actor.id)).limit(1);
    const [dispute] = id ? await db.select({ teacherId: disputes.teacherId }).from(disputes).where(eq(disputes.id, id)).limit(1) : [];
    if (!canAddDisputeNote({ isAdmin: canManageRoles(actor.roles), actorTeacherId: teacher?.id ?? null, disputeTeacherId: dispute?.teacherId ?? null })) return;
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
