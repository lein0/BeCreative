import { and, eq, gte, lte, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookings, classes, linkClicks, memberships, membershipSubscriptions, orders, sessions, teachers } from "@/lib/db/schema";
import { appOrigin } from "@/lib/env";
import { enqueueJob } from "@/lib/jobs";
import { dunningBody } from "@/lib/renewal-copy";
import { SHIP_DEFAULTS } from "@/lib/ship-defaults";

function weekKey(now: Date) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((now.getTime() - start.getTime()) / 86400000 + start.getUTCDay() + 1) / 7);
  return `${now.getUTCFullYear()}-W${week}`;
}

async function queue(input: { key: string; userId: string; event: string; audience: "teacher" | "student"; title: string; body: string; href: string }) {
  await enqueueJob("lifecycle.notify", input, new Date(), input.key);
}

export async function scheduleLifecycle(now = new Date()) {
  let queued = 0;
  const hours = SHIP_DEFAULTS.reviewAskHoursAfter;
  const from = new Date(now.getTime() - (hours + 0.5) * 3_600_000);
  const to = new Date(now.getTime() - (hours - 0.5) * 3_600_000);
  const ended = await db.select().from(sessions).where(and(gte(sessions.endsAt, from), lte(sessions.endsAt, to), ne(sessions.status, "cancelled")));
  for (const session of ended) {
    const [klass] = await db.select().from(classes).where(eq(classes.id, session.classId)).limit(1);
    const seated = await db.execute<{ userId: string }>(sql`
      select b.user_id as "userId" from bookings b
      join booking_sessions bs on bs.booking_id = b.id
      where bs.session_id = ${session.id} and b.status = 'confirmed' and b.user_id is not null
    `);
    for (const row of seated.rows) {
      const userId = row.userId;
      await queue({
        key: `review-ask:${session.id}:${userId}`,
        userId,
        event: "review.ask",
        audience: "student",
        title: klass?.title ?? "class",
        body: "If you have a moment, tell the next student what it was like.",
        href: klass ? `/c/${klass.slug}` : "/bookings",
      });
      queued += 1;
    }
  }

  const cutoff = new Date(now.getTime() - SHIP_DEFAULTS.winbackInactiveDays * 86_400_000);
  const quiet = await db.execute<{ userId: string }>(sql`
    select u.id as "userId"
    from "user" u
    where u.marketing_opt_in = true and u.email_unsubscribed = false and u.email_suppressed = false and u.deleted_at is null
      and exists (
        select 1 from bookings b
        join booking_sessions bs on bs.booking_id = b.id
        join sessions s on s.id = bs.session_id
        where b.user_id = u.id
      )
      and not exists (
        select 1 from bookings b
        join booking_sessions bs on bs.booking_id = b.id
        join sessions s on s.id = bs.session_id
        where b.user_id = u.id and s.starts_at > ${cutoff}
      )
  `);
  const month = `${now.getUTCFullYear()}-${now.getUTCMonth() + 1}`;
  for (const row of quiet.rows) {
    await queue({
      key: `winback:${row.userId}:${month}`,
      userId: row.userId,
      event: "winback",
      audience: "student",
      title: "classes",
      body: "It has been about 30 days. Here is what is coming up.",
      href: "/explore",
    });
    queued += 1;
  }

  const failed = await db.select().from(membershipSubscriptions).where(and(eq(membershipSubscriptions.status, "past_due"), eq(membershipSubscriptions.cancelAtPeriodEnd, false)));
  for (const sub of failed) {
    const [plan] = await db.select().from(memberships).where(eq(memberships.id, sub.membershipId)).limit(1);
    const cancelUrl = `${appOrigin()}/account/memberships/${sub.id}/cancel`;
    await queue({
      key: `renewal-failed:${sub.id}:${month}`,
      userId: sub.userId,
      event: "membership.payment_failed",
      audience: "student",
      title: plan?.name ?? "Your membership",
      body: dunningBody(plan?.name ?? "Your membership", cancelUrl),
      href: `/account/memberships/${sub.id}/cancel`,
    });
    queued += 1;
  }

  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: SHIP_DEFAULTS.quietHoursZone, weekday: "short" }).format(now);
  const stamp = weekKey(now);
  const studios = await db.select().from(teachers).where(eq(teachers.status, "approved"));
  for (const teacher of studios) {
    if (!teacher.stripeChargesEnabled) {
      await queue({
        key: `stripe-nudge:${teacher.id}:${stamp}`,
        userId: teacher.userId,
        event: "teacher.stripe_incomplete",
        audience: "teacher",
        title: teacher.studioName || "your studio",
        body: "Card checkout stays closed until Stripe enables charges.",
        href: "/teach/billing",
      });
      queued += 1;
    }
    if (weekday !== "Mon") continue;
    const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
    const [money] = await db.select({ total: sql<number>`coalesce(sum(${orders.teacherAmountCents}), 0)::int`, count: sql<number>`count(*)::int` }).from(orders).where(and(eq(orders.teacherId, teacher.id), gte(orders.createdAt, weekAgo)));
    const [booked] = await db.select({ count: sql<number>`count(*)::int` }).from(bookings).innerJoin(classes, eq(classes.id, bookings.classId)).where(and(eq(classes.teacherId, teacher.id), gte(bookings.createdAt, weekAgo)));
    const clicks = await db.select({ code: linkClicks.code, count: sql<number>`count(*)::int` }).from(linkClicks).where(and(eq(linkClicks.teacherId, teacher.id), gte(linkClicks.createdAt, weekAgo))).groupBy(linkClicks.code).orderBy(sql`count(*) desc`).limit(3);
    const top = clicks.map((click) => click.code || "direct").join(", ") || "none yet";
    await queue({
      key: `weekly:${teacher.id}:${stamp}`,
      userId: teacher.userId,
      event: "teacher.weekly_summary",
      audience: "teacher",
      title: teacher.studioName || "your studio",
      body: `${Number(booked?.count ?? 0)} bookings, $${(Number(money?.total ?? 0) / 100).toFixed(2)} to the studio, top links: ${top}.`,
      href: "/teach",
    });
    queued += 1;
  }
  return { queued };
}
