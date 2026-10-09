import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { notificationOutbox, notificationPreferences, notifications, platformSettings, triggerOverrides, unsubscribeTokens, user } from "@/lib/db/schema";
import { sendEmail } from "@/lib/email";
import { renderEmail } from "@/lib/email-templates";
import { appOrigin } from "@/lib/env";
import { enqueueJob } from "@/lib/jobs";
import { dispatchText, smsProviderConfigured } from "@/lib/messaging";
import { maySend, smsWanted } from "@/lib/messaging-rules";
import { channelsFor, defaultPrefs, minutesOfClock, smsAllowedNow, unsubscribeUrl, type ChannelPrefs } from "@/lib/notify-prefs";
import { sendWebPush } from "@/lib/push";
import { SHIP_DEFAULTS, TEACHER_EVENTS, type NotificationEvent } from "@/lib/ship-defaults";
import { shortenLink } from "@/lib/short-links";
import { templateFor, triggerEnabled } from "@/lib/triggers";

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
  if (options?.smsOnly) {
    if (enabled) await sendText({ userId: row.userId, phone: destination, title: row.title, body: row.body, href: row.href, imessageEnabled: settings?.imessageEnabled ?? SHIP_DEFAULTS.imessageEnabled, quietStart: settings?.quietHoursStart, quietEnd: settings?.quietHoursEnd, outboxId });
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
    const href = row.href ? new URL(row.href, appOrigin()).toString() : appOrigin();
    const rendered = await renderEmail(trigger?.template ?? row.event, { name: person.name, title: row.title, body: row.body, href, detail: row.body });
    const html = rendered.html.replace("</body>", `<p style="color:#5c564f;font-size:12px;text-align:center">${address}<br><a href="${link}">Unsubscribe</a></p></body>`);
    await sendEmail({
      to: [person.email],
      subject: rendered.subject,
      text: `${rendered.text}\n\n${address}\nUnsubscribe: ${link}`,
      html,
      headers: { "List-Unsubscribe": `<${link}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    });
  }
  if (channels.sms && destination && maySend({ ...consentOk, channel: "sms" })) {
    await sendText({ userId: row.userId, phone: destination, title: row.title, body: row.body, href: row.href, imessageEnabled: settings?.imessageEnabled ?? SHIP_DEFAULTS.imessageEnabled, quietStart: settings?.quietHoursStart, quietEnd: settings?.quietHoursEnd, outboxId, audience, textEligible });
  }
  if (channels.push) {
    await sendWebPush({ endpoint: "", title: row.title, body: row.body, enabled: settings?.webPushEnabled ?? false });
  }
  await db.update(notificationOutbox).set({ status: "sent" }).where(eq(notificationOutbox.id, outboxId));
}

async function sendText(input: { userId: string; phone: string | null; title: string; body: string; href?: string | null; imessageEnabled: boolean; quietStart?: string | null; quietEnd?: string | null; outboxId: string; audience?: "teacher" | "student"; textEligible?: boolean }) {
  if (!input.phone) return;
  const localMinutes = minutesOfClock(new Intl.DateTimeFormat("en-GB", { timeZone: SHIP_DEFAULTS.quietHoursZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date()));
  const start = input.quietStart ?? SHIP_DEFAULTS.quietHoursStart;
  const end = input.quietEnd ?? SHIP_DEFAULTS.quietHoursEnd;
  if (!smsAllowedNow(localMinutes, start, end)) {
    await enqueueJob("notification.sms", { outboxId: input.outboxId, phone: input.phone, audience: input.audience, textEligible: input.textEligible }, nextQuietEnd(end), `sms:${input.outboxId}`);
    return;
  }
  const target = input.href ? await shortenLink(new URL(input.href, appOrigin()).toString()) : "";
  await dispatchText({ to: input.phone, body: `${input.title}. ${input.body} ${target}`.trim(), userId: input.userId, imessageEnabled: input.imessageEnabled });
}

function nextQuietEnd(end: string) {
  const [hour, minute] = end.split(":").map(Number);
  const when = new Date();
  when.setUTCHours(hour + 7, minute, 0, 0);
  if (when.getTime() < Date.now()) when.setUTCDate(when.getUTCDate() + 1);
  return when;
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

