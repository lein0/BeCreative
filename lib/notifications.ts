import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { notificationOutbox, notificationPreferences, notifications, platformSettings, unsubscribeTokens, user } from "@/lib/db/schema";
import { sendEmail } from "@/lib/email";
import { appOrigin } from "@/lib/env";
import { enqueueJob } from "@/lib/jobs";
import { channelsFor, defaultPrefs, minutesOfClock, smsAllowedNow, unsubscribeUrl, type ChannelPrefs } from "@/lib/notify-prefs";
import { sendWebPush } from "@/lib/push";
import { SHIP_DEFAULTS, type NotificationEvent } from "@/lib/ship-defaults";
import { twilioConfigured, sendSms } from "@/lib/sms";

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
  await enqueueJob("notification.deliver", { outboxId: id, phone: input.phone ?? null, audience: input.audience }, runAt, `notify:${id}`);
  return id;
}

function nextDigestTime() {
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(15, 0, 0, 0);
  return tomorrow;
}

export async function deliverOutbox(outboxId: string, phone?: string | null, audienceHint?: "teacher" | "student") {
  const [row] = await db.select().from(notificationOutbox).where(eq(notificationOutbox.id, outboxId)).limit(1);
  if (!row || row.status === "sent" || !row.userId) return;
  const [person] = await db.select().from(user).where(eq(user.id, row.userId)).limit(1);
  const [pref] = await db.select().from(notificationPreferences).where(and(eq(notificationPreferences.userId, row.userId), eq(notificationPreferences.event, row.event))).limit(1);
  const audience = audienceHint ?? (row.event === "booking.created" || row.event === "dispute.opened" || row.event === "payout.sent" || row.event === "signup.followed" || row.event === "ticket.created" || row.event === "review.created" || row.event === "offer.purchased" ? "teacher" : "student");
  const prefs: ChannelPrefs = pref
    ? { email: pref.email, inApp: pref.inApp, sms: pref.sms, push: pref.push, cadence: pref.cadence === "daily" ? "daily" : "instant" }
    : defaultPrefs(row.event as NotificationEvent, audience as "teacher" | "student");
  const [settings] = await db.select().from(platformSettings).limit(1);
  const channels = channelsFor(prefs, {
    unsubscribed: Boolean(person?.emailUnsubscribed),
    webPushEnabled: settings?.webPushEnabled ?? SHIP_DEFAULTS.webPushEnabled,
    smsConfigured: twilioConfigured(),
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
  if (channels.email && person?.email) {
    const token = crypto.randomUUID();
    await db.insert(unsubscribeTokens).values({ token, userId: person.id });
    const link = unsubscribeUrl(appOrigin(), token);
    const address = settings?.mailingAddress ?? SHIP_DEFAULTS.mailingAddress;
    await sendEmail({
      to: [person.email],
      subject: row.title,
      text: `${row.body}\n\n${address}\nUnsubscribe: ${link}`,
      html: `<p>${row.body}</p><p style="color:#666;font-size:12px">${address}<br><a href="${link}">Unsubscribe</a></p>`,
      headers: {
        "List-Unsubscribe": `<${link}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });
  }
  if (channels.sms && phone) {
    const localMinutes = minutesOfClock(new Intl.DateTimeFormat("en-GB", { timeZone: SHIP_DEFAULTS.quietHoursZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date()));
    if (smsAllowedNow(localMinutes, settings?.quietHoursStart ?? SHIP_DEFAULTS.quietHoursStart, settings?.quietHoursEnd ?? SHIP_DEFAULTS.quietHoursEnd)) {
      await sendSms(phone, `${row.title}. ${row.body}`.slice(0, 320));
    } else {
      await enqueueJob("notification.sms", { outboxId, phone }, nextQuietEnd(settings?.quietHoursEnd ?? SHIP_DEFAULTS.quietHoursEnd), `sms:${outboxId}`);
    }
  }
  if (channels.push) {
    await sendWebPush({ endpoint: "", title: row.title, body: row.body, enabled: settings?.webPushEnabled ?? false });
  }
  await db.update(notificationOutbox).set({ status: "sent" }).where(eq(notificationOutbox.id, outboxId));
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

