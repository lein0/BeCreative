import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { cannedReplies, platformSettings, teachers, ticketMessages, tickets, user, userRoles } from "@/lib/db/schema";
import { emitNotification } from "@/lib/notifications";
import { routeTicket, slaDue } from "@/lib/ticket-routing";
import { SHIP_DEFAULTS, type NotificationEvent } from "@/lib/ship-defaults";

async function slaHours() {
  const [row] = await db.select().from(platformSettings).limit(1);
  return row?.ticketTeacherSlaHours ?? SHIP_DEFAULTS.ticketTeacherSlaHours;
}

async function notifyAdmins(input: { event: NotificationEvent; title: string; body: string; href: string }, exceptUserId?: string) {
  const admins = await db.select({ userId: userRoles.userId }).from(userRoles).where(eq(userRoles.role, "admin"));
  for (const admin of admins) {
    if (admin.userId === exceptUserId) continue;
    await emitNotification({ userId: admin.userId, event: input.event, audience: "teacher", title: input.title, body: input.body, href: input.href });
  }
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
    await emitNotification({ userId: person.id, event: "ticket.updated", audience: "student", title: `We opened “${input.subject}”`, body: "You will get a reply here and by email.", href: `/help/tickets/${id}` });
  }
  if (route.owner === "teacher" && input.teacherId) {
    const [teacher] = await db.select().from(teachers).where(eq(teachers.id, input.teacherId)).limit(1);
    if (teacher) {
      await emitNotification({ userId: teacher.userId, event: "ticket.created", audience: "teacher", title: `Student question: ${input.subject}`, body: input.body, href: "/teach/support" });
    }
  }
  if (route.owner === "admin") {
    await notifyAdmins({ event: "ticket.created", title: `Support: ${input.subject}`, body: input.body, href: `/admin/support/${id}` });
  }
  return { id, route: route.owner };
}

export async function replyToTicket(input: { ticketId: string; authorUserId: string; body: string; internal?: boolean; teacherSide?: boolean }) {
  const [source] = await db.select().from(tickets).where(eq(tickets.id, input.ticketId)).limit(1);
  if (!source) return;
  const destinationId = source.status === "merged" && source.mergedIntoId ? source.mergedIntoId : source.id;
  const [ticket] = destinationId === source.id ? [source] : await db.select().from(tickets).where(eq(tickets.id, destinationId)).limit(1);
  if (!ticket || ticket.status === "merged") return;
  await db.insert(ticketMessages).values({ id: crypto.randomUUID(), ticketId: ticket.id, authorUserId: input.authorUserId, body: input.body, internal: Boolean(input.internal) });
  const studentWrote = Boolean(ticket.userId && ticket.userId === input.authorUserId);
  await db.update(tickets).set({ updatedAt: new Date(), status: input.internal || studentWrote ? "open" : "waiting" }).where(eq(tickets.id, ticket.id));
  if (!input.internal) {
    if (ticket.userId && ticket.userId !== input.authorUserId) {
      await emitNotification({ userId: ticket.userId, event: "ticket.updated", audience: "student", title: `Reply: ${ticket.subject}`, body: input.body, href: `/help/tickets/${ticket.id}` });
    }
    if (input.teacherSide && ticket.teacherId) {
      const [teacher] = await db.select().from(teachers).where(eq(teachers.id, ticket.teacherId)).limit(1);
      if (teacher && teacher.userId !== input.authorUserId) {
        await emitNotification({ userId: teacher.userId, event: "ticket.updated", audience: "teacher", title: `Reply: ${ticket.subject}`, body: input.body, href: "/teach/support" });
      }
    }
    if (studentWrote && ticket.route === "admin") {
      await notifyAdmins({ event: "ticket.updated", title: `Reply: ${ticket.subject}`, body: input.body, href: `/admin/support/${ticket.id}` }, input.authorUserId);
    }
  }
}

export async function assignTicket(ticketId: string, assigneeUserId: string) {
  await db.update(tickets).set({ assigneeUserId, updatedAt: new Date() }).where(eq(tickets.id, ticketId));
}

export async function mergeTickets(sourceId: string, targetId: string) {
  if (!sourceId || !targetId || sourceId === targetId) return { ok: false as const };
  const [source] = await db.select().from(tickets).where(eq(tickets.id, sourceId)).limit(1);
  const [target] = await db.select().from(tickets).where(eq(tickets.id, targetId)).limit(1);
  if (!source || !target || source.userId !== target.userId || target.status === "merged") return { ok: false as const };
  await db.update(ticketMessages).set({ ticketId: targetId }).where(eq(ticketMessages.ticketId, sourceId));
  await db.update(tickets).set({ status: "merged", mergedIntoId: targetId, updatedAt: new Date() }).where(eq(tickets.id, sourceId));
  return { ok: true as const };
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
  const routed = await db.select().from(tickets).where(eq(tickets.route, "teacher"));
  let count = 0;
  for (const ticket of routed) {
    if (ticket.escalatedAt || (ticket.status !== "open" && ticket.status !== "waiting")) continue;
    const replies = await db.select().from(ticketMessages).where(eq(ticketMessages.ticketId, ticket.id));
    const teacherReplied = replies.some((message) => message.authorUserId && message.authorUserId !== ticket.userId && !message.internal);
    const decision = routeTicket({ category: ticket.category, createdAt: ticket.createdAt, now, slaHours: hours, teacherReplied });
    if (decision.escalate) {
      await db.update(tickets).set({ route: "admin", escalatedAt: now, updatedAt: now }).where(eq(tickets.id, ticket.id));
      await notifyAdmins({ event: "ticket.updated", title: `Escalated: ${ticket.subject}`, body: "The teacher reply window passed.", href: `/admin/support/${ticket.id}` });
      count += 1;
    }
  }
  return { count };
}

export async function saveCannedReply(title: string, body: string, category: string) {
  await db.insert(cannedReplies).values({ id: crypto.randomUUID(), title, body, category });
}
