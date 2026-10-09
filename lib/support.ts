import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { cannedReplies, platformSettings, teachers, ticketMessages, tickets, user } from "@/lib/db/schema";
import { emitNotification } from "@/lib/notifications";
import { routeTicket, slaDue } from "@/lib/ticket-routing";
import { SHIP_DEFAULTS } from "@/lib/ship-defaults";

async function slaHours() {
  const [row] = await db.select().from(platformSettings).limit(1);
  return row?.ticketTeacherSlaHours ?? SHIP_DEFAULTS.ticketTeacherSlaHours;
}

export async function openTicket(input: { userId: string; teacherId?: string | null; bookingId?: string | null; orderId?: string | null; category: string; subject: string; body: string; priority?: string }) {
  const now = new Date();
  const hours = await slaHours();
  const route = routeTicket({ category: input.category, createdAt: now, now, slaHours: hours, teacherReplied: false });
  const id = crypto.randomUUID();
  await db.insert(tickets).values({
    id,
    userId: input.userId,
    teacherId: input.teacherId,
    bookingId: input.bookingId,
    orderId: input.orderId,
    category: input.category,
    priority: input.category === "safety" ? "urgent" : input.priority || "normal",
    subject: input.subject,
    route: route.owner,
    slaDueAt: slaDue(now, hours),
    escalatedAt: route.escalate ? now : null,
  });
  await db.insert(ticketMessages).values({ id: crypto.randomUUID(), ticketId: id, authorUserId: input.userId, body: input.body });
  const [person] = await db.select().from(user).where(eq(user.id, input.userId)).limit(1);
  if (person) {
    await emitNotification({ userId: person.id, event: "ticket.updated", audience: "student", title: `We opened “${input.subject}”`, body: "You will get a reply here and by email.", href: `/help` });
  }
  if (route.owner === "teacher" && input.teacherId) {
    const [teacher] = await db.select().from(teachers).where(eq(teachers.id, input.teacherId)).limit(1);
    if (teacher) {
      await emitNotification({ userId: teacher.userId, event: "ticket.created", audience: "teacher", title: `Student question: ${input.subject}`, body: input.body, href: "/teach/support" });
    }
  }
  const { capture } = await import("@/lib/analytics");
  await capture({ name: "ticket_opened", userId: input.userId, properties: { category: input.category, ticketId: id } });
  return { id, route: route.owner };
}

export async function replyToTicket(input: { ticketId: string; authorUserId: string; body: string; internal?: boolean; teacherSide?: boolean }) {
  await db.insert(ticketMessages).values({ id: crypto.randomUUID(), ticketId: input.ticketId, authorUserId: input.authorUserId, body: input.body, internal: Boolean(input.internal) });
  await db.update(tickets).set({ updatedAt: new Date(), status: input.internal ? "open" : "waiting" }).where(eq(tickets.id, input.ticketId));
  if (!input.internal) {
    const [ticket] = await db.select().from(tickets).where(eq(tickets.id, input.ticketId)).limit(1);
    if (ticket?.userId && ticket.userId !== input.authorUserId) {
      await emitNotification({ userId: ticket.userId, event: "ticket.updated", audience: "student", title: `Reply: ${ticket.subject}`, body: input.body, href: "/help" });
    }
    if (input.teacherSide && ticket?.teacherId) {
      const [teacher] = await db.select().from(teachers).where(eq(teachers.id, ticket.teacherId)).limit(1);
      if (teacher && teacher.userId !== input.authorUserId) {
        await emitNotification({ userId: teacher.userId, event: "ticket.updated", audience: "teacher", title: `Reply: ${ticket.subject}`, body: input.body, href: "/teach/support" });
      }
    }
  }
}

export async function assignTicket(ticketId: string, assigneeUserId: string) {
  await db.update(tickets).set({ assigneeUserId, updatedAt: new Date() }).where(eq(tickets.id, ticketId));
}

export async function mergeTickets(sourceId: string, targetId: string) {
  await db.update(tickets).set({ status: "merged", mergedIntoId: targetId, updatedAt: new Date() }).where(eq(tickets.id, sourceId));
  await db.update(ticketMessages).set({ ticketId: targetId }).where(eq(ticketMessages.ticketId, sourceId));
}

export async function resolveTicket(ticketId: string) {
  const [ticket] = await db.select().from(tickets).where(eq(tickets.id, ticketId)).limit(1);
  if (!ticket) return;
  await db.update(tickets).set({ status: "resolved", updatedAt: new Date() }).where(eq(tickets.id, ticketId));
  if (ticket.userId) {
    await emitNotification({
      userId: ticket.userId,
      event: "ticket.updated",
      audience: "student",
      title: `Resolved: ${ticket.subject}`,
      body: "If you have a minute, rate how that went from the ticket.",
      href: `/help/tickets/${ticketId}`,
    });
  }
}

export async function recordCsat(ticketId: string, score: number) {
  await db.update(tickets).set({ csatScore: Math.max(1, Math.min(5, score)) }).where(eq(tickets.id, ticketId));
}

export async function escalateDueTickets(now = new Date()) {
  const hours = await slaHours();
  const open = await db.select().from(tickets).where(and(eq(tickets.route, "teacher"), isNull(tickets.escalatedAt), eq(tickets.status, "open")));
  let count = 0;
  for (const ticket of open) {
    const replies = await db.select().from(ticketMessages).where(eq(ticketMessages.ticketId, ticket.id));
    const teacherReplied = replies.some((message) => message.authorUserId && message.authorUserId !== ticket.userId && !message.internal);
    const decision = routeTicket({ category: ticket.category, createdAt: ticket.createdAt, now, slaHours: hours, teacherReplied });
    if (decision.escalate) {
      await db.update(tickets).set({ route: "admin", escalatedAt: now, updatedAt: now }).where(eq(tickets.id, ticket.id));
      count += 1;
    }
  }
  return { count };
}

export async function saveCannedReply(title: string, body: string, category: string) {
  await db.insert(cannedReplies).values({ id: crypto.randomUUID(), title, body, category });
}
