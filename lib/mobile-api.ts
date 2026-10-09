import { and, desc, eq } from "drizzle-orm";
import { hashToken, parseBearer, tokenUsable } from "@/lib/api-token";
import { capture, stitchAnonymous } from "@/lib/analytics";
import { auth, emailVerificationRequired } from "@/lib/auth";
import { bookSession, cancelBooking, purchaseOffer, rescheduleBooking } from "@/lib/booking-service";
import { db } from "@/lib/db";
import {
  apiTokens,
  bookings,
  classes,
  deviceTokens,
  faqArticles,
  membershipSubscriptions,
  memberships,
  notificationPreferences,
  notifications,
  packPurchases,
  packs,
  teachers,
  tickets,
  user,
  userRoles,
  waivers,
  waiverSignatures,
} from "@/lib/db/schema";
import { exposeExperiment, subjectFromCookies } from "@/lib/experiments";
import { FAQ_ARTICLES } from "@/lib/faq";
import { hitRateLimit } from "@/lib/rate-limit";
import { catalog, classDetail, matchesServiceQuery, publishedServices, teacherProfile } from "@/lib/queries";
import { isCatalogEvent, MONEY_EVENTS, platformName } from "@/lib/analytics-events";
import { openTicket } from "@/lib/support";
import { signWaiver } from "@/lib/wellness-service";
import { applyContactPrefs } from "@/lib/contact-prefs";

type Actor = { id: string; name: string; email: string; roles: string[] };

function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}

async function actorFromRequest(request: Request): Promise<Actor | null> {
  const token = parseBearer(request.headers.get("authorization"));
  if (!token) return null;
  const [row] = await db.select().from(apiTokens).where(eq(apiTokens.tokenHash, hashToken(token))).limit(1);
  if (!row || !tokenUsable(row)) return null;
  const [person] = await db.select().from(user).where(eq(user.id, row.userId)).limit(1);
  if (!person || person.deletedAt) return null;
  const roles = await db.select().from(userRoles).where(eq(userRoles.userId, person.id));
  return { id: person.id, name: person.name, email: person.email, roles: roles.map((role) => role.role) };
}

async function issueToken(userId: string) {
  const raw = `bc_${crypto.randomUUID().replace(/-/g, "")}`;
  await db.insert(apiTokens).values({
    id: crypto.randomUUID(),
    userId,
    tokenHash: hashToken(raw),
    expiresAt: new Date(Date.now() + 30 * 86_400_000),
  });
  return raw;
}

async function ticketTargets(userId: string, bookingId?: string, teacherId?: string): Promise<{ error: string; status: number } | { bookingId?: string; teacherId?: string }> {
  if (bookingId) {
    const [booking] = await db.select().from(bookings).where(and(eq(bookings.id, bookingId), eq(bookings.userId, userId))).limit(1);
    if (!booking) return { error: "Booking not found.", status: 404 };
    const [klass] = await db.select({ teacherId: classes.teacherId }).from(classes).where(eq(classes.id, booking.classId)).limit(1);
    if (!klass) return { error: "Booking not found.", status: 404 };
    if (teacherId && teacherId !== klass.teacherId) return { error: "That teacher does not teach this booking.", status: 403 };
    return { bookingId, teacherId: klass.teacherId };
  }
  if (teacherId) {
    const [owned] = await db
      .select({ id: bookings.id })
      .from(bookings)
      .innerJoin(classes, eq(classes.id, bookings.classId))
      .where(and(eq(bookings.userId, userId), eq(classes.teacherId, teacherId)))
      .limit(1);
    if (!owned) return { error: "That teacher is not on your bookings.", status: 403 };
    return { teacherId };
  }
  return {};
}

async function requireActor(request: Request) {
  const actor = await actorFromRequest(request);
  if (!actor) return { error: json({ error: "Sign in required." }, 401) };
  return { actor };
}

export async function handleMobileApi(request: Request, path: string[]) {
  const [root, second, third] = path;
  const method = request.method.toUpperCase();
  const url = new URL(request.url);
  const platform = platformName(url.searchParams.get("platform") || request.headers.get("x-platform"));

  if (method === "POST" && root === "auth" && second === "sign-in") {
    const limit = await hitRateLimit(`api-signin:${request.headers.get("x-forwarded-for") || "api"}`, 10, 60_000);
    if (!limit.ok) return json({ error: "Too many attempts." }, 429);
    const body = await request.json() as { email?: string; password?: string; anonymousId?: string };
    try {
      const result = await auth.api.signInEmail({ body: { email: body.email || "", password: body.password || "" } });
      const userId = result.user.id;
      await stitchAnonymous(userId, body.anonymousId || null);
      if (emailVerificationRequired() && !result.user.emailVerified) {
        return json({ error: "Verify your email before signing in.", verificationRequired: true }, 403);
      }
      const token = await issueToken(userId);
      return json({ token, user: { id: userId, name: result.user.name, email: result.user.email } });
    } catch {
      return json({ error: "Check the email and password." }, 401);
    }
  }

  if (method === "POST" && root === "auth" && second === "sign-up") {
    const limit = await hitRateLimit(`api-signup:${request.headers.get("x-forwarded-for") || "api"}`, 10, 60_000);
    if (!limit.ok) return json({ error: "Too many attempts." }, 429);
    const body = await request.json() as { email?: string; password?: string; name?: string; phone?: string; smsOptIn?: boolean; marketingOptIn?: boolean; anonymousId?: string };
    try {
      const result = await auth.api.signUpEmail({ body: { email: body.email || "", password: body.password || "", name: body.name || "" } });
      const userId = result.user.id;
      const form = new FormData();
      if (body.phone) form.set("phone", body.phone);
      if (body.smsOptIn) form.set("smsOptIn", "1");
      if (body.marketingOptIn) form.set("marketingOptIn", "1");
      await applyContactPrefs(userId, form, "capture");
      await stitchAnonymous(userId, body.anonymousId || null);
      await capture({ name: "signup_completed", userId, anonymousId: body.anonymousId, platform });
      if (emailVerificationRequired() && !result.user.emailVerified) {
        return json({ verificationRequired: true, user: { id: userId, name: result.user.name, email: result.user.email } });
      }
      const token = await issueToken(userId);
      return json({ token, user: { id: userId, name: result.user.name, email: result.user.email } });
    } catch {
      return json({ error: "Could not create the account." }, 400);
    }
  }

  if (method === "POST" && root === "auth" && second === "sign-out") {
    const token = parseBearer(request.headers.get("authorization"));
    if (token) await db.update(apiTokens).set({ revokedAt: new Date() }).where(eq(apiTokens.tokenHash, hashToken(token)));
    return json({ ok: true });
  }

  if (method === "POST" && root === "track") {
    const limit = await hitRateLimit(`api-track:${request.headers.get("x-forwarded-for") || "track"}`, 120, 60_000);
    if (!limit.ok) return json({ error: "Too many events." }, 429);
    const body = await request.json() as { name?: string; anonymousId?: string; properties?: Record<string, string>; consent?: boolean; path?: string; platform?: string };
    if (!body.name || !isCatalogEvent(body.name)) return json({ error: "Unknown event." }, 400);
    if (MONEY_EVENTS.has(body.name)) return json({ error: "That event is recorded by the server." }, 400);
    const actor = await actorFromRequest(request);
    await capture({
      name: body.name,
      userId: actor?.id,
      anonymousId: body.anonymousId,
      platform: body.platform || platform,
      path: body.path,
      properties: body.properties,
      consent: body.consent,
    });
    return json({ ok: true });
  }

  if (method === "GET" && root === "experiments" && second) {
    const actor = await actorFromRequest(request);
    const explicit = url.searchParams.get("subject");
    const subject = explicit || (await subjectFromCookies(actor?.id));
    const assigned = await exposeExperiment(decodeURIComponent(second), subject, actor?.id, platform);
    if (!assigned) return json({ error: "Experiment not found." }, 404);
    return json(assigned);
  }

  if (method === "GET" && root === "explore") {
    const rows = await catalog({
      q: url.searchParams.get("q") || undefined,
      category: url.searchParams.get("category") || undefined,
      vertical: url.searchParams.get("vertical") || undefined,
      level: url.searchParams.get("level") || undefined,
      format: url.searchParams.get("format") || undefined,
    });
    if (platform !== "web") await capture({ name: "screen_view", platform, path: "/explore" });
    if (url.searchParams.get("q")) await capture({ name: "search", platform, properties: { q: url.searchParams.get("q") || "" } });
    const filters = ["category", "vertical", "level", "format"].filter((key) => url.searchParams.get(key));
    if (filters.length) await capture({ name: "filter_used", platform, path: "/explore", properties: { filters: filters.join(",") } });
    return json({ classes: rows.map(publicClass) });
  }

  if (method === "GET" && root === "search") {
    const q = url.searchParams.get("q") || "";
    const rows = await catalog({ q, vertical: url.searchParams.get("vertical") || undefined });
    const visits = (await publishedServices()).filter((row) => matchesServiceQuery(row, q));
    await capture({ name: "search", platform, properties: { q } });
    return json({
      classes: rows.map(publicClass),
      services: visits.map((row) => ({ id: row.service.id, slug: row.service.slug, title: row.service.title, teacher: row.teacher.studioName || row.teacher.slug })),
    });
  }

  if (method === "GET" && root === "classes" && second && second !== "slots" && !third) {
    const detail = await classDetail(decodeURIComponent(second));
    if (!detail) return json({ error: "Class not found." }, 404);
    await capture({ name: "class_viewed", platform, path: `/c/${detail.class.slug}`, vertical: detail.category.vertical, category: detail.category.slug, city: detail.location?.city, properties: { classId: detail.class.id, teacherId: detail.teacher.id } });
    return json({
      class: { ...publicClass(detail), seriesPriceCents: detail.class.pricePerSeriesCents, categoryId: detail.class.categoryId },
      description: detail.class.description,
      slots: detail.upcoming.map((session) => ({ id: session.id, startsAt: session.startsAt, spots: session.spots })),
      teacher: { id: detail.teacher.id, slug: detail.teacher.slug, name: detail.teacher.studioName || detail.teacher.slug },
    });
  }

  if (method === "GET" && root === "teachers" && second) {
    const profile = await teacherProfile(decodeURIComponent(second));
    if (!profile) return json({ error: "Teacher not found." }, 404);
    return json({
      teacher: { slug: profile.teacher.slug, name: profile.teacher.studioName || profile.person?.name, bio: profile.teacher.bio },
      classes: profile.offerings.map((klass) => ({ id: klass.id, slug: klass.slug, title: klass.title })),
    });
  }

  const authResult = await requireActor(request);
  if ("error" in authResult && authResult.error) {
    if (root === "help" && method === "GET") {
      const list = await visibleHelpArticles();
      if (second) {
        const article = list.find((item) => item.slug === decodeURIComponent(second));
        if (!article) return json({ error: "Article not found." }, 404);
        await capture({ name: "help_article_viewed", platform, properties: { slug: article.slug } });
        return json(article);
      }
      return json({ articles: list.map((item) => ({ slug: item.slug, title: item.title, category: item.category })) });
    }
    return authResult.error;
  }
  const actor = authResult.actor;

  if (method === "GET" && root === "auth" && second === "me") return json({ user: actor });

  if (method === "GET" && root === "bookings" && !second) {
    const rows = await db.select({ booking: bookings, klass: classes }).from(bookings).innerJoin(classes, eq(classes.id, bookings.classId)).where(eq(bookings.userId, actor.id)).orderBy(desc(bookings.createdAt));
    return json({ bookings: rows.map((row) => ({ id: row.booking.id, status: row.booking.status, title: row.klass.title, slug: row.klass.slug, createdAt: row.booking.createdAt })) });
  }

  if (method === "POST" && root === "bookings" && !second) {
    const body = await request.json() as { sessionId?: string; classId?: string; series?: boolean; code?: string; payWith?: string; policyAccepted?: boolean; paymentSheet?: boolean };
    const result = await bookSession({
      userId: actor.id,
      email: actor.email,
      name: actor.name,
      sessionId: body.sessionId,
      classId: body.classId,
      series: body.series,
      code: body.code,
      payWith: body.payWith,
      policyAccepted: body.policyAccepted,
      paymentSheet: body.paymentSheet,
      platform,
      returnToApp: true,
      ip: request.headers.get("x-forwarded-for"),
    });
    return json(result, "error" in result && result.error ? 400 : 200);
  }

  if (method === "POST" && root === "bookings" && second && third === "cancel") {
    const result = await cancelBooking(actor.id, decodeURIComponent(second));
    return json(result, "error" in result && result.error ? 400 : 200);
  }

  if (method === "POST" && root === "bookings" && second && third === "reschedule") {
    const body = await request.json() as { sessionId?: string };
    const result = await rescheduleBooking(actor.id, decodeURIComponent(second), body.sessionId || "");
    return json(result, "error" in result && result.error ? 400 : 200);
  }

  if (method === "GET" && root === "wallet") {
    const [packRows, subRows] = await Promise.all([
      db.select({ purchase: packPurchases, pack: packs }).from(packPurchases).innerJoin(packs, eq(packs.id, packPurchases.packId)).where(eq(packPurchases.userId, actor.id)),
      db.select({ sub: membershipSubscriptions, plan: memberships }).from(membershipSubscriptions).innerJoin(memberships, eq(memberships.id, membershipSubscriptions.membershipId)).where(eq(membershipSubscriptions.userId, actor.id)),
    ]);
    return json({
      packs: packRows.map((row) => ({ id: row.purchase.id, name: row.pack.name, remaining: row.purchase.creditsRemaining, total: row.purchase.creditsTotal, classIds: row.pack.classIds, categoryIds: row.pack.categoryIds, teacherId: row.pack.teacherId })),
      memberships: subRows.map((row) => ({ id: row.sub.id, name: row.plan.name, status: row.sub.status, periodEnd: row.sub.currentPeriodEnd })),
    });
  }

  if (method === "POST" && root === "packs" && second === "purchase") {
    const body = await request.json() as { id?: string; code?: string; paymentSheet?: boolean };
    const result = await purchaseOffer({ userId: actor.id, email: actor.email, kind: "pack", id: body.id || "", code: body.code, paymentSheet: body.paymentSheet, returnToApp: true });
    return json(result, "error" in result && result.error ? 400 : 200);
  }

  if (method === "POST" && root === "memberships" && second === "purchase") {
    const body = await request.json() as { id?: string; code?: string };
    const result = await purchaseOffer({ userId: actor.id, email: actor.email, kind: "membership", id: body.id || "", code: body.code, returnToApp: true });
    return json(result, "error" in result && result.error ? 400 : 200);
  }

  if (method === "GET" && root === "waivers" && second) {
    const [teacher] = await db.select().from(teachers).where(eq(teachers.slug, decodeURIComponent(second))).limit(1);
    if (!teacher) return json({ error: "Teacher not found." }, 404);
    const [waiver] = await db.select().from(waivers).where(eq(waivers.teacherId, teacher.id)).limit(1);
    const [signed] = waiver ? await db.select().from(waiverSignatures).where(and(eq(waiverSignatures.userId, actor.id), eq(waiverSignatures.waiverId, waiver.id), eq(waiverSignatures.version, waiver.version))).limit(1) : [];
    return json({ body: waiver?.body ?? null, version: waiver?.version ?? null, signed: Boolean(signed) });
  }

  if (method === "POST" && root === "waivers" && second && third === "sign") {
    const [teacher] = await db.select().from(teachers).where(eq(teachers.slug, decodeURIComponent(second))).limit(1);
    if (!teacher) return json({ error: "Teacher not found." }, 404);
    const body = await request.json() as { signedName?: string };
    const result = await signWaiver({ teacherId: teacher.id, userId: actor.id, signedName: body.signedName || "", ip: request.headers.get("x-forwarded-for") });
    return json(result, "error" in result && result.error ? 400 : 200);
  }

  if (method === "GET" && root === "notifications") {
    const rows = await db.select().from(notifications).where(eq(notifications.userId, actor.id)).orderBy(desc(notifications.createdAt)).limit(50);
    return json({ notifications: rows });
  }

  if (method === "POST" && root === "notifications" && second === "read") {
    const body = await request.json().catch(() => ({})) as { id?: string };
    if (body.id) await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.id, body.id), eq(notifications.userId, actor.id)));
    else await db.update(notifications).set({ readAt: new Date() }).where(eq(notifications.userId, actor.id));
    await capture({ name: "notification_opened", userId: actor.id, platform, properties: { id: body.id || "all" } });
    return json({ ok: true });
  }

  if (method === "GET" && root === "preferences") {
    const rows = await db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, actor.id));
    const [person] = await db.select().from(user).where(eq(user.id, actor.id)).limit(1);
    return json({ preferences: rows, smsOptIn: person?.smsOptIn ?? false, marketingOptIn: person?.marketingOptIn ?? false, phone: person?.phone ?? null });
  }

  if (method === "PUT" && root === "preferences") {
    const body = await request.json() as { event?: string; email?: boolean; inApp?: boolean; sms?: boolean; push?: boolean; cadence?: string; smsOptIn?: boolean; marketingOptIn?: boolean; phone?: string };
    if (body.event) {
      const [existing] = await db.select().from(notificationPreferences).where(and(eq(notificationPreferences.userId, actor.id), eq(notificationPreferences.event, body.event))).limit(1);
      const row = { email: Boolean(body.email), inApp: body.inApp !== false, sms: Boolean(body.sms), push: Boolean(body.push), cadence: body.cadence === "daily" ? "daily" : "instant" };
      if (existing) await db.update(notificationPreferences).set(row).where(eq(notificationPreferences.id, existing.id));
      else await db.insert(notificationPreferences).values({ id: crypto.randomUUID(), userId: actor.id, event: body.event, ...row });
    }
    await db.update(user).set({
      ...(body.phone !== undefined ? { phone: body.phone || null } : {}),
      ...(body.smsOptIn !== undefined ? { smsOptIn: body.smsOptIn } : {}),
      ...(body.marketingOptIn !== undefined ? { marketingOptIn: body.marketingOptIn } : {}),
    }).where(eq(user.id, actor.id));
    return json({ ok: true });
  }

  if (method === "POST" && root === "push-tokens") {
    const body = await request.json() as { token?: string; platform?: string; provider?: string };
    if (!body.token) return json({ error: "Token required." }, 400);
    const provider = body.provider === "apns" || body.provider === "fcm" || body.provider === "expo" ? body.provider : "expo";
    await db.insert(deviceTokens).values({
      id: crypto.randomUUID(),
      userId: actor.id,
      token: body.token,
      platform: platformName(body.platform || platform),
      provider,
    }).onConflictDoUpdate({
      target: deviceTokens.token,
      set: { userId: actor.id, platform: platformName(body.platform || platform), provider },
    });
    return json({ ok: true });
  }

  if (method === "DELETE" && root === "push-tokens") {
    const body = await request.json() as { token?: string };
    if (body.token) await db.delete(deviceTokens).where(and(eq(deviceTokens.token, body.token), eq(deviceTokens.userId, actor.id)));
    return json({ ok: true });
  }

  if (method === "GET" && root === "help") {
    const list = await visibleHelpArticles();
    if (second) {
      const article = list.find((item) => item.slug === decodeURIComponent(second));
      if (!article) return json({ error: "Article not found." }, 404);
      await capture({ name: "help_article_viewed", userId: actor.id, platform, properties: { slug: article.slug } });
      return json(article);
    }
    return json({ articles: list.map((item) => ({ slug: item.slug, title: item.title, category: item.category })) });
  }

  if (method === "GET" && root === "tickets") {
    const rows = await db.select().from(tickets).where(eq(tickets.userId, actor.id)).orderBy(desc(tickets.createdAt));
    return json({ tickets: rows.map((ticket) => ({ id: ticket.id, subject: ticket.subject, status: ticket.status, category: ticket.category })) });
  }

  if (method === "POST" && root === "tickets") {
    const limit = await hitRateLimit(`api-ticket:${actor.id}`, 10, 60 * 60 * 1000);
    if (!limit.ok) return json({ error: "Too many tickets." }, 429);
    const body = await request.json() as { category?: string; subject?: string; body?: string; teacherId?: string; bookingId?: string };
    const targets = await ticketTargets(actor.id, body.bookingId, body.teacherId);
    if ("error" in targets) return json({ error: targets.error }, targets.status);
    const opened = await openTicket({ userId: actor.id, teacherId: targets.teacherId, bookingId: targets.bookingId, category: body.category || "class", subject: body.subject || "Help", body: body.body || "" });
    return json({ id: opened.id });
  }

  if (method === "GET" && root === "classes" && second === "slots") {
    const detail = await classDetail(url.searchParams.get("slug") || "");
    return json({ slots: detail?.upcoming.map((session) => ({ id: session.id, startsAt: session.startsAt, spots: session.spots })) ?? [] });
  }

  return json({ error: "Not found." }, 404);
}

async function visibleHelpArticles() {
  const articles = await db.select().from(faqArticles).where(eq(faqArticles.published, true));
  return articles.length ? articles : FAQ_ARTICLES;
}

function publicClass(row: { class: { id: string; slug: string; title: string; pricePerSessionCents: number | null; delivery: string }; teacher: { slug: string; studioName: string | null }; category?: { slug: string; vertical: string; name: string }; next?: { startsAt: Date } | null; price?: number; spots?: number | null }) {
  return {
    id: row.class.id,
    slug: row.class.slug,
    title: row.class.title,
    priceCents: row.price ?? row.class.pricePerSessionCents,
    delivery: row.class.delivery,
    teacher: row.teacher.studioName || row.teacher.slug,
    teacherSlug: row.teacher.slug,
    category: row.category?.slug,
    vertical: row.category?.vertical,
    nextStartsAt: row.next?.startsAt ?? null,
    spots: row.spots ?? null,
  };
}
