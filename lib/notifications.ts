import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookings, classes, deviceTokens, notificationOutbox, notificationPreferences, notifications, platformSettings, recurrences, teachers, triggerOverrides, unsubscribeTokens, user } from "@/lib/db/schema";
import { sendEmail } from "@/lib/email";
import { renderEmail } from "@/lib/email-templates";
import { appOrigin } from "@/lib/env";
import { enqueueJob } from "@/lib/jobs";
import { dispatchText, smsProviderConfigured } from "@/lib/messaging";
import { maySend, smsWanted } from "@/lib/messaging-rules";
import { channelsFor, defaultPrefs, unsubscribeUrl, type ChannelPrefs } from "@/lib/notify-prefs";
import { smsSendDecision } from "@/lib/sms-window";
import { sendWebPush } from "@/lib/push";
import { SHIP_DEFAULTS, TEACHER_EVENTS, type NotificationEvent } from "@/lib/ship-defaults";
import { shortenLink } from "@/lib/short-links";
import { templateFor, triggerEnabled } from "@/lib/triggers";

function trackedUrl(href: string, event: "notification_clicked" | "notification_opened", channel: string, userId: string) {
  const target = new URL(href, appOrigin()).toString();
  const url = new URL("/api/r", appOrigin());
  url.searchParams.set("e", event);
  url.searchParams.set("c", channel);
  url.searchParams.set("u", userId);
  if (event === "notification_clicked") url.searchParams.set("to", target);
  return url.toString();
}

function clickUrl(href: string, channel: string, userId: string) {
  return trackedUrl(href, "notification_clicked", channel, userId);
}

function openPixelUrl(channel: string, userId: string) {
  return trackedUrl("/", "notification_opened", channel, userId);
}

export async function emitNotification(input: {
  userId: string;
  event: NotificationEvent;
  title: string;
  body: string;
  href?: string;
  audience: "teacher" | "student";
  email?: string | null;
  phone?: string | null;
  demo?: boolean;
  textEligible?: boolean;
}) {
  const id = crypto.randomUUID();
  await db.insert(notificationOutbox).values({
    id,
    userId: input.userId,
    event: input.event,
    title: input.title,
    body: input.body,
    href: input.href,
  });
  const [pref] = await db.select().from(notificationPreferences).where(and(eq(notificationPreferences.userId, input.userId), eq(notificationPreferences.event, input.event))).limit(1);
  const prefs: ChannelPrefs = pref
    ? { email: pref.email, inApp: pref.inApp, sms: pref.sms, push: pref.push, cadence: pref.cadence === "daily" ? "daily" : "instant" }
    : defaultPrefs(input.event, input.audience);
  const runAt = prefs.cadence === "daily" ? nextDigestTime() : new Date();
  await enqueueJob("notification.deliver", { outboxId: id, phone: input.phone ?? null, audience: input.audience, textEligible: Boolean(input.textEligible) }, runAt, `notify:${id}`);
  return id;
}

function nextDigestTime() {
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(15, 0, 0, 0);
  return tomorrow;
}

function audienceFor(event: string, hint?: "teacher" | "student") {
  if (hint) return hint;
  if (event !== "booking.cancelled" && (TEACHER_EVENTS as readonly string[]).includes(event)) return "teacher" as const;
  return "student" as const;
}

async function triggerMap() {
  const rows = await db.select().from(triggerOverrides);
  return Object.fromEntries(rows.map((row) => [row.id, row.enabled]));
}

export async function deliverOutbox(outboxId: string, phone?: string | null, audienceHint?: "teacher" | "student", options?: { textEligible?: boolean; smsOnly?: boolean }) {
  const [row] = await db.select().from(notificationOutbox).where(eq(notificationOutbox.id, outboxId)).limit(1);
  if (!row || !row.userId) return;
  if (row.status === "sent" && !options?.smsOnly) return;
  const [person] = await db.select().from(user).where(eq(user.id, row.userId)).limit(1);
  const audience = audienceFor(row.event, audienceHint);
  const trigger = templateFor(row.event, audience);
  const enabled = !trigger || triggerEnabled(trigger.id, await triggerMap());
  const [settings] = await db.select().from(platformSettings).limit(1);
  const destination = phone || person?.phone || null;
  const zone = await smsZone(row.userId, row.href);
  if (options?.smsOnly) {
    if (enabled) await sendText({ userId: row.userId, phone: destination, title: row.title, body: row.body, href: row.href, imessageEnabled: settings?.imessageEnabled ?? SHIP_DEFAULTS.imessageEnabled, outboxId, timeZone: zone });
    return;
  }
  if (!enabled) {
    await db.update(notificationOutbox).set({ status: "skipped" }).where(eq(notificationOutbox.id, outboxId));
    return;
  }
  const [pref] = await db.select().from(notificationPreferences).where(and(eq(notificationPreferences.userId, row.userId), eq(notificationPreferences.event, row.event))).limit(1);
  const textEligible = Boolean(options?.textEligible);
  const base: ChannelPrefs = pref
    ? { email: pref.email, inApp: pref.inApp, sms: pref.sms, push: pref.push, cadence: pref.cadence === "daily" ? "daily" : "instant" }
    : defaultPrefs(row.event as NotificationEvent, audience);
  const prefs: ChannelPrefs = { ...base, sms: smsWanted({ event: row.event, textEligible, savedSms: pref ? pref.sms : null }) };
  const consent = trigger?.consent ?? "transactional";
  const channels = channelsFor(prefs, {
    unsubscribed: Boolean(person?.emailUnsubscribed),
    emailSuppressed: Boolean(person?.emailSuppressed),
    webPushEnabled: settings?.webPushEnabled ?? SHIP_DEFAULTS.webPushEnabled,
    smsConfigured: smsProviderConfigured(),
    smsOptIn: Boolean(person?.smsOptIn),
    consent,
    marketingOptIn: Boolean(person?.marketingOptIn),
    event: row.event,
  });
  if (channels.inApp) {
    await db.insert(notifications).values({
      id: crypto.randomUUID(),
      userId: row.userId,
      event: row.event,
      title: row.title,
      body: row.body,
      href: row.href,
    });
  }
  const consentOk = {
    consent,
    emailUnsubscribed: Boolean(person?.emailUnsubscribed),
    emailSuppressed: Boolean(person?.emailSuppressed),
    marketingOptIn: Boolean(person?.marketingOptIn),
    smsOptIn: Boolean(person?.smsOptIn),
    smsSuppressed: false,
  };
  if (channels.email && person?.email && maySend({ ...consentOk, channel: "email", event: row.event })) {
    const token = crypto.randomUUID();
    await db.insert(unsubscribeTokens).values({ token, userId: person.id });
    const link = unsubscribeUrl(appOrigin(), token);
    const address = settings?.mailingAddress ?? SHIP_DEFAULTS.mailingAddress;
    const href = row.href ? clickUrl(row.href, "email", person.id) : appOrigin();
    const rendered = await renderEmail(trigger?.template ?? row.event, { name: person.name, title: row.title, body: row.body, href, detail: row.body });
    const pixel = `<img src="${openPixelUrl("email", person.id)}" width="1" height="1" alt="" />`;
    const html = rendered.html.replace("</body>", `${pixel}<p style="color:#5c564f;font-size:12px;text-align:center">${address}<br><a href="${link}">Unsubscribe</a></p></body>`);
    await sendEmail({
      to: [person.email],
      subject: rendered.subject,
      text: `${rendered.text}\n\n${address}\nUnsubscribe: ${link}`,
      html,
      headers: { "List-Unsubscribe": `<${link}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    });
  }
  if (channels.sms && destination && maySend({ ...consentOk, channel: "sms" })) {
    await sendText({ userId: row.userId, phone: destination, title: row.title, body: row.body, href: row.href, imessageEnabled: settings?.imessageEnabled ?? SHIP_DEFAULTS.imessageEnabled, outboxId, audience, textEligible, timeZone: zone });
  }
  if (channels.push) {
    await sendWebPush({ endpoint: "", title: row.title, body: row.body, enabled: settings?.webPushEnabled ?? false });
  }
  const tokens = await db.select().from(deviceTokens).where(eq(deviceTokens.userId, row.userId));
  const wantsDevicePush = tokens.length > 0 && (pref ? pref.push : true);
  if (wantsDevicePush) {
    const { sendDevicePush } = await import("@/lib/device-push");
    await sendDevicePush(tokens, row.title, row.body, row.href ? clickUrl(row.href, "push", row.userId) : undefined);
  }
  await db.update(notificationOutbox).set({ status: "sent" }).where(eq(notificationOutbox.id, outboxId));
}

async function classTimeZone(classId: string) {
  const [rule] = await db.select({ timezone: recurrences.timezone }).from(recurrences).where(eq(recurrences.classId, classId)).limit(1);
  return rule?.timezone ?? null;
}

async function smsZone(userId: string, href: string | null) {
  const [person] = await db.select({ timezone: user.timezone }).from(user).where(eq(user.id, userId)).limit(1);
  let classTimeZoneValue: string | null = null;
  const classSlug = href?.match(/^\/c\/([^/?#]+)/)?.[1];
  if (classSlug) {
    const [klass] = await db.select({ id: classes.id }).from(classes).where(eq(classes.slug, classSlug)).limit(1);
    if (klass) classTimeZoneValue = await classTimeZone(klass.id);
  }
  if (!classTimeZoneValue) {
    const [booking] = await db.select({ classId: bookings.classId }).from(bookings).where(and(eq(bookings.userId, userId), eq(bookings.status, "confirmed"))).limit(1);
    if (booking) classTimeZoneValue = await classTimeZone(booking.classId);
  }
  if (!classTimeZoneValue) {
    const [teacher] = await db.select({ id: teachers.id }).from(teachers).where(eq(teachers.userId, userId)).limit(1);
    if (teacher) {
      const [klass] = await db.select({ id: classes.id }).from(classes).where(eq(classes.teacherId, teacher.id)).limit(1);
      if (klass) classTimeZoneValue = await classTimeZone(klass.id);
    }
  }
  return smsSendDecision(new Date(), { recipientTimeZone: person?.timezone, classTimeZone: classTimeZoneValue }).timeZone;
}

async function sendText(input: { userId: string; phone: string | null; title: string; body: string; href?: string | null; imessageEnabled: boolean; outboxId: string; audience?: "teacher" | "student"; textEligible?: boolean; timeZone: string }) {
  if (!input.phone) return;
  const decision = smsSendDecision(new Date(), { recipientTimeZone: input.timeZone });
  if (!decision.send) {
    await enqueueJob("notification.sms", { outboxId: input.outboxId, phone: input.phone, audience: input.audience, textEligible: input.textEligible }, decision.runAt, `sms:${input.outboxId}`);
    return;
  }
  const target = input.href ? await shortenLink(clickUrl(input.href, "sms", input.userId)) : "";
  await dispatchText({ to: input.phone, body: `${input.title}. ${input.body} ${target}`.trim(), userId: input.userId, imessageEnabled: input.imessageEnabled });
}

export async function unreadCount(userId: string) {
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(notifications).where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return Number(row?.count ?? 0);
}

export async function markNotificationsRead(userId: string, id?: string) {
  if (id) await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
  else await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
}

export async function unsubscribeByToken(token: string) {
  const [row] = await db.select().from(unsubscribeTokens).where(eq(unsubscribeTokens.token, token)).limit(1);
  if (!row) return false;
  await db.update(user).set({ emailUnsubscribed: true }).where(eq(user.id, row.userId));
  return true;
}

