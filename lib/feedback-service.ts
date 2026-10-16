import { and, desc, eq, ilike, inArray, sql } from "drizzle-orm";
import { appOrigin } from "@/lib/env";
import { sendIndividually } from "@/lib/email";
import {
  buildApprovedPayload,
  FEEDBACK_STATUS_LABELS,
  FEEDBACK_TYPE_LABELS,
  feedbackRole,
  initialFeedbackStatus,
  isFeedbackPriority,
  isFeedbackStatus,
  isFeedbackType,
  isFixerStatus,
  isSensitiveFeedback,
  notifiesAuthor,
  parseMarks,
  parseTargets,
  parseViewport,
  pinPath,
  type FeedbackPriority,
  type FeedbackStatus,
  type FeedbackType,
  type FixerStatus,
} from "@/lib/feedback-rules";
import { createFeedbackDispatcher, type DeliveryAttempt } from "@/lib/feedback-webhook";
import { db } from "@/lib/db";
import { feedback, feedbackDeliveries, feedbackEvents, user, userRoles } from "@/lib/db/schema";
import type { FeedbackMark, FeedbackTarget, FeedbackViewport } from "@/lib/db/schema";
import { signedObjectUrl } from "@/lib/storage";

export type CreateFeedbackInput = {
  authorUserId: string;
  authorName: string;
  authorEmail: string;
  roles: readonly string[];
  type: string;
  priority: string;
  title: string;
  body: string;
  url: string;
  route: string;
  device: string;
  viewport: unknown;
  marks: unknown;
  targets: unknown;
  screenshotKey: string | null;
};

export class FeedbackError extends Error {}

async function addEvent(input: { feedbackId: string; kind: string; body: string; actorUserId?: string | null; actorName?: string | null }) {
  await db.insert(feedbackEvents).values({
    id: crypto.randomUUID(),
    feedbackId: input.feedbackId,
    kind: input.kind,
    body: input.body,
    actorUserId: input.actorUserId ?? null,
    actorName: input.actorName ?? null,
  });
}

async function adminEmails() {
  const rows = await db
    .select({ email: user.email })
    .from(userRoles)
    .innerJoin(user, eq(user.id, userRoles.userId))
    .where(eq(userRoles.role, "admin"));
  return rows.map((row) => row.email);
}

async function safeMail(recipients: string[], subject: string, text: string) {
  if (!recipients.length) return;
  try {
    await sendIndividually({ recipients, subject, text });
  } catch (error) {
    console.error("feedback email", error);
  }
}

function typeLabel(type: string) {
  return FEEDBACK_TYPE_LABELS[type as FeedbackType] ?? type;
}

function statusLabel(status: string) {
  return FEEDBACK_STATUS_LABELS[status as FeedbackStatus] ?? status;
}

export async function createFeedback(input: CreateFeedbackInput) {
  const role = feedbackRole(input.roles);
  if (!role) throw new FeedbackError("Feedback is limited to admins and account managers.");
  if (!isFeedbackType(input.type)) throw new FeedbackError("Choose a feedback type.");
  if (!isFeedbackPriority(input.priority)) throw new FeedbackError("Choose a priority.");
  const body = input.body.trim();
  if (!body) throw new FeedbackError("A comment is required.");
  const viewport = parseViewport(input.viewport);
  if (!viewport) throw new FeedbackError("Viewport details are missing.");
  const marks = parseMarks(input.marks);
  const targets = parseTargets(input.targets);
  const title = input.title.trim() || null;
  const route = input.route.trim();
  const url = input.url.trim();
  if (!route.startsWith("/") || !url) throw new FeedbackError("Page details are missing.");
  const status = initialFeedbackStatus(role);
  const now = new Date();
  const id = crypto.randomUUID();
  const sensitive = isSensitiveFeedback({ route, title, body, targets });
  await db.insert(feedback).values({
    id,
    authorUserId: input.authorUserId,
    authorRole: role,
    type: input.type,
    priority: input.priority,
    title,
    body,
    url,
    route,
    selector: targets[0]?.selector || null,
    elementText: targets[0]?.text || null,
    targets,
    marks,
    viewport,
    device: input.device || "desktop",
    screenshotKey: input.screenshotKey,
    sensitive,
    status,
    approvedBy: status === "approved" ? input.authorUserId : null,
    approvedAt: status === "approved" ? now : null,
    authorReadAt: now,
    isDemo: false,
  });
  await addEvent({ feedbackId: id, kind: "created", body, actorUserId: input.authorUserId, actorName: input.authorName });
  const link = `${appOrigin()}/admin/feedback/${id}`;
  await safeMail(
    await adminEmails(),
    `Feedback: ${title || typeLabel(input.type)} (${route})`,
    `${input.authorName} (${role}) left ${typeLabel(input.type).toLowerCase()} feedback on ${url}\n\n${body}\n\n${link}`,
  );
  if (status === "approved") {
    await safeMail(
      [input.authorEmail],
      `Your feedback was approved`,
      `Your note on ${route} was approved and sent to the fix loop.\n\n${link}`,
    );
  }
  return { id, status };
}

export async function recordDeliveries(feedbackId: string, attempts: DeliveryAttempt[]) {
  if (!attempts.length) return;
  await db.insert(feedbackDeliveries).values(
    attempts.map((attempt) => ({
      id: crypto.randomUUID(),
      feedbackId,
      attempt: attempt.attempt,
      status: attempt.status,
      httpStatus: attempt.httpStatus,
      error: attempt.error,
    })),
  );
  const last = attempts[attempts.length - 1];
  const summary = last?.status === "delivered" ? "Webhook delivered." : last?.status === "undelivered" ? "Webhook not configured. Recorded as undelivered." : `Webhook failed after ${attempts.length} attempts.`;
  await addEvent({ feedbackId, kind: "dispatch", body: summary, actorName: "fix loop" });
}

type LoadedItem = {
  id: string;
  title: string | null;
  body: string;
  type: string;
  priority: string;
  status: string;
  sensitive: boolean;
  url: string;
  route: string;
  selector: string | null;
  elementText: string | null;
  targets: FeedbackTarget[];
  marks: FeedbackMark[];
  viewport: FeedbackViewport;
  device: string;
  screenshotKey: string | null;
  authorUserId: string;
  authorRole: string;
  authorName: string;
  authorEmail: string;
  approvedBy: string | null;
  approvedAt: Date | null;
  fixPrUrl: string | null;
  fixNotes: string | null;
  createdAt: Date;
};

async function loadItem(id: string): Promise<LoadedItem | null> {
  const [row] = await db
    .select({
      id: feedback.id,
      title: feedback.title,
      body: feedback.body,
      type: feedback.type,
      priority: feedback.priority,
      status: feedback.status,
      sensitive: feedback.sensitive,
      url: feedback.url,
      route: feedback.route,
      selector: feedback.selector,
      elementText: feedback.elementText,
      targets: feedback.targets,
      marks: feedback.marks,
      viewport: feedback.viewport,
      device: feedback.device,
      screenshotKey: feedback.screenshotKey,
      authorUserId: feedback.authorUserId,
      authorRole: feedback.authorRole,
      authorName: user.name,
      authorEmail: user.email,
      approvedBy: feedback.approvedBy,
      approvedAt: feedback.approvedAt,
      fixPrUrl: feedback.fixPrUrl,
      fixNotes: feedback.fixNotes,
      createdAt: feedback.createdAt,
    })
    .from(feedback)
    .innerJoin(user, eq(user.id, feedback.authorUserId))
    .where(eq(feedback.id, id))
    .limit(1);
  return row ?? null;
}

async function commentsFor(ids: string[]) {
  if (!ids.length) return new Map<string, { at: string; author: string; body: string }[]>();
  const rows = await db
    .select({
      feedbackId: feedbackEvents.feedbackId,
      body: feedbackEvents.body,
      actorName: feedbackEvents.actorName,
      createdAt: feedbackEvents.createdAt,
    })
    .from(feedbackEvents)
    .where(and(inArray(feedbackEvents.feedbackId, ids), eq(feedbackEvents.kind, "comment")))
    .orderBy(feedbackEvents.createdAt);
  const map = new Map<string, { at: string; author: string; body: string }[]>();
  for (const row of rows) {
    const list = map.get(row.feedbackId) ?? [];
    list.push({ at: row.createdAt.toISOString(), author: row.actorName || "Someone", body: row.body });
    map.set(row.feedbackId, list);
  }
  return map;
}

export async function toPayload(row: LoadedItem, comments: { at: string; author: string; body: string }[] = []) {
  let screenshotUrl: string | null = null;
  if (row.screenshotKey) {
    try {
      screenshotUrl = await signedObjectUrl(row.screenshotKey);
    } catch (error) {
      console.error("feedback screenshot url", error);
    }
  }
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    type: row.type,
    priority: row.priority,
    status: row.status,
    sensitive: row.sensitive,
    url: row.url,
    route: row.route,
    selector: row.selector,
    element_text: row.elementText,
    targets: row.targets ?? [],
    marks: row.marks ?? [],
    viewport: row.viewport,
    device: row.device,
    screenshot_url: screenshotUrl,
    author: { id: row.authorUserId, name: row.authorName, email: row.authorEmail, role: row.authorRole },
    approved_by: row.approvedBy,
    approved_at: row.approvedAt?.toISOString() ?? null,
    fix_pr_url: row.fixPrUrl,
    fix_notes: row.fixNotes,
    created_at: row.createdAt.toISOString(),
    comments,
  };
}

/** Dispatch never throws. A missing webhook is stored as undelivered. */
export async function dispatchFeedback(id: string) {
  try {
    const row = await loadItem(id);
    if (!row || row.status !== "approved") return;
    const comments = (await commentsFor([id])).get(id) ?? [];
    const payload = buildApprovedPayload(await toPayload(row, comments), new Date().toISOString());
    const attempts = await createFeedbackDispatcher().deliver(JSON.stringify(payload));
    await recordDeliveries(id, attempts);
  } catch (error) {
    console.error("feedback dispatch", error);
    try {
      await recordDeliveries(id, [{ attempt: 1, status: "failed", httpStatus: null, error: error instanceof Error ? error.message : "Dispatch failed" }]);
    } catch (inner) {
      console.error("feedback delivery log", inner);
    }
  }
}

async function notifyAuthor(row: { authorEmail: string; route: string; status: string; fixPrUrl?: string | null; fixNotes?: string | null }) {
  if (!notifiesAuthor(row.status)) return;
  const extra = [row.fixNotes ? row.fixNotes : "", row.fixPrUrl ? `Pull request: ${row.fixPrUrl}` : ""].filter(Boolean).join("\n");
  await safeMail(
    [row.authorEmail],
    `Your feedback is ${statusLabel(row.status).toLowerCase()}`,
    `Your note on ${row.route} is now ${statusLabel(row.status).toLowerCase()}.${extra ? `\n\n${extra}` : ""}`,
  );
}

export async function approveFeedback(actor: { id: string; name: string }, id: string, edits?: { title?: string; body?: string; type?: string; priority?: string }) {
  const row = await loadItem(id);
  if (!row) throw new FeedbackError("That note is gone.");
  if (row.status === "rejected") throw new FeedbackError("That note is closed.");
  const title = edits?.title !== undefined ? edits.title.trim() || null : row.title;
  const body = edits?.body !== undefined ? edits.body.trim() : row.body;
  if (!body) throw new FeedbackError("A comment is required.");
  const type = edits?.type && isFeedbackType(edits.type) ? edits.type : row.type;
  const priority = edits?.priority && isFeedbackPriority(edits.priority) ? edits.priority : row.priority;
  const sensitive = isSensitiveFeedback({ route: row.route, title, body, targets: row.targets });
  const now = new Date();
  const transition = row.status !== "approved";
  await db
    .update(feedback)
    .set({ title, body, type, priority, sensitive, status: "approved", approvedBy: actor.id, approvedAt: now, updatedAt: now, inboxReadAt: now })
    .where(eq(feedback.id, id));
  await addEvent({ feedbackId: id, kind: "status", body: "Approved for the fix loop.", actorUserId: actor.id, actorName: actor.name });
  if (transition) await notifyAuthor({ authorEmail: row.authorEmail, route: row.route, status: "approved" });
  return { dispatch: transition || edits != null };
}

export async function rejectFeedback(actor: { id: string; name: string }, id: string, reason: string) {
  const row = await loadItem(id);
  if (!row) throw new FeedbackError("That note is gone.");
  const note = reason.trim();
  if (!note) throw new FeedbackError("A rejection needs a reason.");
  const now = new Date();
  await db.update(feedback).set({ status: "rejected", fixNotes: note, updatedAt: now, inboxReadAt: now }).where(eq(feedback.id, id));
  await addEvent({ feedbackId: id, kind: "status", body: `Rejected. ${note}`, actorUserId: actor.id, actorName: actor.name });
  await notifyAuthor({ authorEmail: row.authorEmail, route: row.route, status: "rejected", fixNotes: note });
}

export async function mergeFeedback(actor: { id: string; name: string }, primaryId: string, duplicateIds: string[]) {
  const ids = [...new Set(duplicateIds.filter((id) => id && id !== primaryId))];
  if (!ids.length) throw new FeedbackError("Choose at least one duplicate.");
  const primary = await loadItem(primaryId);
  if (!primary) throw new FeedbackError("That note is gone.");
  const now = new Date();
  await db
    .update(feedback)
    .set({ status: "rejected", mergedIntoId: primaryId, fixNotes: `Merged into ${primaryId}`, updatedAt: now })
    .where(inArray(feedback.id, ids));
  for (const id of ids) {
    await addEvent({ feedbackId: id, kind: "status", body: `Merged into ${primaryId}.`, actorUserId: actor.id, actorName: actor.name });
  }
  await addEvent({ feedbackId: primaryId, kind: "comment", body: `Merged ${ids.length} duplicate${ids.length === 1 ? "" : "s"} into this note.`, actorUserId: actor.id, actorName: actor.name });
}

export async function applyFixerStatus(id: string, input: { status: FixerStatus; fixPrUrl?: string | null; fixNotes?: string | null; comment?: string | null }) {
  const row = await loadItem(id);
  if (!row) return null;
  const now = new Date();
  await db
    .update(feedback)
    .set({
      status: input.status,
      fixPrUrl: input.fixPrUrl?.trim() || row.fixPrUrl,
      fixNotes: input.fixNotes?.trim() || row.fixNotes,
      updatedAt: now,
      inboxReadAt: null,
    })
    .where(eq(feedback.id, id));
  const bits = [`Status set to ${statusLabel(input.status)}.`, input.fixNotes?.trim() || ""].filter(Boolean).join(" ");
  await addEvent({ feedbackId: id, kind: "status", body: bits, actorName: "fixer" });
  if (input.comment?.trim()) {
    await addEvent({ feedbackId: id, kind: "comment", body: input.comment.trim(), actorName: "fixer" });
  }
  await notifyAuthor({
    authorEmail: row.authorEmail,
    route: row.route,
    status: input.status,
    fixPrUrl: input.fixPrUrl?.trim() || row.fixPrUrl,
    fixNotes: input.fixNotes?.trim() || null,
  });
  return { id, status: input.status };
}

export async function addReply(actor: { id: string; name: string; roles: readonly string[] }, id: string, body: string) {
  const row = await loadItem(id);
  if (!row) throw new FeedbackError("That note is gone.");
  const role = feedbackRole(actor.roles);
  if (!role) throw new FeedbackError("Feedback is limited to admins and account managers.");
  if (role !== "admin" && row.authorUserId !== actor.id) throw new FeedbackError("You can reply on your own notes.");
  const text = body.trim();
  if (!text) throw new FeedbackError("Write a reply.");
  await addEvent({ feedbackId: id, kind: "comment", body: text, actorUserId: actor.id, actorName: actor.name });
  const now = new Date();
  if (row.authorUserId === actor.id) {
    await db.update(feedback).set({ authorReadAt: now, updatedAt: now, inboxReadAt: null }).where(eq(feedback.id, id));
  } else {
    await db.update(feedback).set({ updatedAt: now, inboxReadAt: now }).where(eq(feedback.id, id));
  }
}

export async function markAuthorRead(userId: string, id: string) {
  await db.update(feedback).set({ authorReadAt: new Date() }).where(and(eq(feedback.id, id), eq(feedback.authorUserId, userId)));
}

export async function markInboxRead(id: string) {
  await db.update(feedback).set({ inboxReadAt: new Date() }).where(eq(feedback.id, id));
}

export async function adminInboxUnreadCount() {
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(feedback).where(sql`${feedback.inboxReadAt} is null`);
  return Number(row?.count ?? 0);
}

export async function authorUnreadCount(userId: string) {
  const rows = await db
    .select({ id: feedback.id })
    .from(feedback)
    .innerJoin(feedbackEvents, eq(feedbackEvents.feedbackId, feedback.id))
    .where(
      and(
        eq(feedback.authorUserId, userId),
        sql`${feedback.authorReadAt} is not null and ${feedbackEvents.createdAt} > ${feedback.authorReadAt}`,
        sql`(${feedbackEvents.actorUserId} is null or ${feedbackEvents.actorUserId} <> ${feedback.authorUserId})`,
      ),
    );
  return new Set(rows.map((row) => row.id)).size;
}

export async function listPins(userId: string, route: string) {
  const rows = await db
    .select({
      id: feedback.id,
      title: feedback.title,
      body: feedback.body,
      status: feedback.status,
      marks: feedback.marks,
      route: feedback.route,
    })
    .from(feedback)
    .where(and(eq(feedback.authorUserId, userId), eq(feedback.route, route), inArray(feedback.status, ["pending_review", "approved", "queued", "needs_info", "in_progress", "fixed"])));
  return rows;
}

export async function listMine(userId: string) {
  const rows = await db
    .select()
    .from(feedback)
    .where(eq(feedback.authorUserId, userId))
    .orderBy(desc(feedback.createdAt));
  const ids = rows.map((row) => row.id);
  const events = ids.length
    ? await db.select().from(feedbackEvents).where(inArray(feedbackEvents.feedbackId, ids)).orderBy(feedbackEvents.createdAt)
    : [];
  return rows.map((row) => ({
    ...row,
    unread:
      row.authorReadAt != null &&
      events.some(
        (event) =>
          event.feedbackId === row.id &&
          event.createdAt > row.authorReadAt! &&
          (event.actorUserId == null || event.actorUserId !== row.authorUserId),
      ),
    events: events.filter((event) => event.feedbackId === row.id),
  }));
}

export async function listInbox(filters: { status?: string; authorId?: string; type?: string; page?: string }) {
  const where = [];
  if (filters.status && isFeedbackStatus(filters.status)) where.push(eq(feedback.status, filters.status));
  if (filters.authorId) where.push(eq(feedback.authorUserId, filters.authorId));
  if (filters.type && isFeedbackType(filters.type)) where.push(eq(feedback.type, filters.type));
  if (filters.page) where.push(ilike(feedback.route, `%${filters.page.replace(/[%_]/g, "")}%`));
  const rows = await db
    .select({
      id: feedback.id,
      title: feedback.title,
      body: feedback.body,
      type: feedback.type,
      priority: feedback.priority,
      status: feedback.status,
      route: feedback.route,
      url: feedback.url,
      sensitive: feedback.sensitive,
      screenshotKey: feedback.screenshotKey,
      createdAt: feedback.createdAt,
      inboxReadAt: feedback.inboxReadAt,
      authorName: user.name,
      authorEmail: user.email,
      fixPrUrl: feedback.fixPrUrl,
    })
    .from(feedback)
    .innerJoin(user, eq(user.id, feedback.authorUserId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(feedback.createdAt));
  return rows;
}

export async function listAuthors() {
  const rows = await db
    .selectDistinct({ id: user.id, name: user.name })
    .from(feedback)
    .innerJoin(user, eq(user.id, feedback.authorUserId))
    .orderBy(user.name);
  return rows;
}

export async function getFeedbackDetail(id: string) {
  const row = await loadItem(id);
  if (!row) return null;
  const events = await db.select().from(feedbackEvents).where(eq(feedbackEvents.feedbackId, id)).orderBy(feedbackEvents.createdAt);
  const deliveries = await db.select().from(feedbackDeliveries).where(eq(feedbackDeliveries.feedbackId, id)).orderBy(feedbackDeliveries.createdAt);
  const others = await db
    .select({ id: feedback.id, title: feedback.title, route: feedback.route, status: feedback.status })
    .from(feedback)
    .where(and(sql`${feedback.id} <> ${id}`, inArray(feedback.status, ["pending_review", "approved", "queued", "needs_info"])));
  return { row, events, deliveries, others, pin: pinPath(row.url, row.id) };
}

export async function listQueue(status: FeedbackStatus) {
  const rows = await db
    .select({ id: feedback.id })
    .from(feedback)
    .where(eq(feedback.status, status))
    .orderBy(feedback.createdAt);
  const items = [];
  const comments = await commentsFor(rows.map((row) => row.id));
  for (const stub of rows) {
    const row = await loadItem(stub.id);
    if (!row) continue;
    items.push(await toPayload(row, comments.get(row.id) ?? []));
  }
  return items;
}

export function assertFixerStatus(value: string): FixerStatus {
  if (!isFixerStatus(value)) throw new FeedbackError("That status is not set by the fix loop.");
  return value;
}

export type { FeedbackPriority, FeedbackType };
