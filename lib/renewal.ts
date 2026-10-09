import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { adminEmails } from "@/lib/env";
import { db } from "@/lib/db";
import {
  membershipMaterialChanges,
  membershipPriceChanges,
  membershipSubscriptions,
  memberships,
  notifications,
  orders,
  platformSettings,
  renewalCancellations,
  renewalConsents,
  renewalNotices,
  renewalTemplates,
  teachers,
  user,
} from "@/lib/db/schema";
import { sendEmail } from "@/lib/email";
import { logEvent } from "@/lib/log";
import {
  MATERIAL_CHANGE_MIN_DAYS,
  PRICE_CHANGE_MIN_DAYS_BACKEND,
  acknowledgmentMail,
  benefitsSummary,
  buildDisclosure,
  cancellationMail,
  cancellationScreen,
  confirmationSummary,
  dunningBody,
  firstName,
  isoDate,
  legalIdentity,
  membershipOffer,
  mergeTemplates,
  missedNoticeSkipsCharge,
  noticeAlert,
  noticeMail,
  planNotices,
  priceAfterNotice,
  priceChangeDateError,
  type DisclosureView,
  type LegalIdentity,
  type NoticeKind,
  type RenewalTemplates,
} from "@/lib/renewal-copy";
import { setSubscriptionRenewalAmount, stopSubscriptionRenewal } from "@/lib/stripe";

export async function renewalSaveOfferEnabled() {
  const [row] = await db.select({ on: platformSettings.renewalSaveOffer }).from(platformSettings).where(eq(platformSettings.id, 1)).limit(1);
  return row?.on === true;
}

export async function setRenewalSaveOffer(on: boolean, actorUserId: string) {
  await db.update(platformSettings).set({ renewalSaveOffer: on, updatedAt: new Date(), updatedBy: actorUserId }).where(eq(platformSettings.id, 1));
}

async function mailingAddress() {
  const [row] = await db.select({ mailingAddress: platformSettings.mailingAddress }).from(platformSettings).where(eq(platformSettings.id, 1)).limit(1);
  return row?.mailingAddress;
}

export async function activeTemplates(): Promise<RenewalTemplates> {
  const [row] = await db.select().from(renewalTemplates).where(eq(renewalTemplates.active, true)).limit(1);
  if (!row) return mergeTemplates(null);
  return mergeTemplates({ ...(row.body as Partial<RenewalTemplates>), version: row.version });
}

async function contextLegal(): Promise<LegalIdentity> {
  const address = await mailingAddress();
  return legalIdentity(address ? { mailingAddress: address } : undefined);
}

export async function disclosureForMembership(membershipId: string, now = new Date()) {
  const [plan] = await db.select().from(memberships).where(eq(memberships.id, membershipId)).limit(1);
  if (!plan || !plan.active) return null;
  const [teacher] = await db.select().from(teachers).where(eq(teachers.id, plan.teacherId)).limit(1);
  if (!teacher) return null;
  const templates = await activeTemplates();
  const legal = await contextLegal();
  const offer = membershipOffer({
    priceCents: plan.priceCents,
    termMonths: plan.termMonths,
    recurring: plan.recurring,
    introDays: plan.introDays,
    introPriceCents: plan.introPriceCents,
    now,
  });
  const disclosure = buildDisclosure({
    membershipName: plan.name,
    teacherName: teacher.studioName || "Teacher",
    teacherSlug: teacher.slug,
    membershipSlug: plan.slug,
    priceCents: offer.todayCents,
    renewalPriceCents: offer.renewalCents,
    termMonths: plan.termMonths,
    now,
    periodEnd: offer.periodEnd,
    intro: offer.intro,
    cardBrand: "card",
    last4: "••••",
    policyText: plan.pauseCancelPolicy,
  }, templates, legal);
  return { plan, teacher, offer, disclosure, templates, legal };
}

export function disclosurePayload(disclosure: DisclosureView) {
  return {
    disclosureVersion: disclosure.version,
    templateVersion: disclosure.templateVersion,
    lines: disclosure.lines.map((item) => ({ text: item.segments.map((segment) => segment.text).join(""), bold: item.bold })),
    checkbox: disclosure.checkbox,
    termsLine: disclosure.termsLine,
    termsUrl: disclosure.termsUrl,
    policyUrl: disclosure.policyUrl,
    buttonLabel: disclosure.buttonLabel,
    consentRequired: disclosure.consentRequired,
    priceCents: disclosure.priceCents,
    renewalPriceCents: disclosure.renewalPriceCents,
    termMonths: disclosure.termMonths,
    firstRenewalDate: disclosure.firstRenewalDate,
    cardBrand: disclosure.cardBrand,
    last4: disclosure.last4,
  };
}

export async function recordRenewalConsent(input: {
  userId: string;
  membershipId: string;
  teacherId: string;
  subscriptionId: string;
  orderId: string;
  disclosure: DisclosureView;
  ip?: string | null;
  userAgent?: string | null;
  platform?: string;
  appVersion?: string | null;
}) {
  const id = crypto.randomUUID();
  await db.insert(renewalConsents).values({
    id,
    userId: input.userId,
    membershipId: input.membershipId,
    teacherId: input.teacherId,
    subscriptionId: input.subscriptionId,
    orderId: input.orderId,
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
    platform: input.platform || "web",
    appVersion: input.appVersion ?? null,
    disclosureText: input.disclosure.canonical,
    disclosureVersion: input.disclosure.version,
    templateVersion: input.disclosure.templateVersion,
    checkboxAccepted: true,
    priceCents: input.disclosure.priceCents,
    renewalPriceCents: input.disclosure.renewalPriceCents,
    termMonths: input.disclosure.termMonths,
  });
  return id;
}

async function alertOps(message: string) {
  logEvent("error", message);
  const recipients = adminEmails();
  if (!recipients.length) return;
  await sendEmail({ to: recipients, subject: "Renewal notice needs attention", text: message });
}

async function rememberInApp(userId: string, title: string, body: string, href: string) {
  try {
    await db.insert(notifications).values({ id: crypto.randomUUID(), userId, event: "membership.notice", title, body, href });
  } catch {
    /* The audit row is the record that has to survive. */
  }
}

export async function sendAcknowledgmentForOrder(orderId: string) {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order || order.kind !== "membership" || !order.userId) return;
  const [consent] = await db.select().from(renewalConsents).where(eq(renewalConsents.orderId, orderId)).limit(1);
  if (consent?.ackEmailId) return;
  const [sub] = await db.select().from(membershipSubscriptions).where(eq(membershipSubscriptions.orderId, orderId)).limit(1);
  const [plan] = sub ? await db.select().from(memberships).where(eq(memberships.id, sub.membershipId)).limit(1) : [];
  const [teacher] = plan ? await db.select().from(teachers).where(eq(teachers.id, plan.teacherId)).limit(1) : [];
  const [person] = await db.select().from(user).where(eq(user.id, order.userId)).limit(1);
  if (!sub || !plan || !teacher || !person?.email) return;
  const templates = await activeTemplates();
  const legal = await contextLegal();
  const cancelUrl = `${legal.siteUrl}/account/memberships/${sub.id}/cancel`;
  const mail = acknowledgmentMail({
    firstName: firstName(person.name),
    membershipName: plan.name,
    teacherName: teacher.studioName || "Teacher",
    benefits: benefitsSummary(plan),
    start: sub.currentPeriodStart,
    amountChargedCents: order.studentPaysCents,
    taxCents: 0,
    cardBrand: sub.cardBrand || "card",
    last4: sub.cardLast4 || "••••",
    termMonths: plan.termMonths,
    renewalPriceCents: sub.renewalPriceCents > 0 ? sub.renewalPriceCents : plan.priceCents,
    nextRenewal: sub.currentPeriodEnd,
    introEndsAt: sub.introEndsAt,
    policyText: plan.pauseCancelPolicy,
    policyUrl: `${legal.siteUrl}/t/${teacher.slug}/m/${plan.slug}`,
    cancelUrl,
  }, templates, legal);
  const fromLine = `From: ${legal.platformName} <${legal.notificationsEmail}> on behalf of ${teacher.studioName || "Teacher"}`;
  const text = `${fromLine}\n\n${mail.text}`;
  const sent = await sendEmail({ to: [person.email], subject: mail.subject, text, html: mail.html, teacherId: teacher.id });
  if (consent) {
    await db.update(renewalConsents).set({
      ackEmailId: sent.id,
      ackDeliveryStatus: sent.ok ? "sent" : "failed",
    }).where(eq(renewalConsents.id, consent.id));
  }
  await rememberInApp(person.id, mail.subject, "Your membership terms are saved in Account › Memberships.", `/account/memberships/${sub.id}/terms`);
  if (!sent.ok) await alertOps(`Acknowledgment email failed for order ${orderId}.`);
}

export async function membershipTerms(subscriptionId: string, userId: string) {
  const [sub] = await db.select().from(membershipSubscriptions).where(and(eq(membershipSubscriptions.id, subscriptionId), eq(membershipSubscriptions.userId, userId))).limit(1);
  if (!sub) return null;
  const [plan] = await db.select().from(memberships).where(eq(memberships.id, sub.membershipId)).limit(1);
  const [teacher] = plan ? await db.select().from(teachers).where(eq(teachers.id, plan.teacherId)).limit(1) : [];
  const [person] = await db.select().from(user).where(eq(user.id, userId)).limit(1);
  const [order] = sub.orderId ? await db.select().from(orders).where(eq(orders.id, sub.orderId)).limit(1) : [];
  const [consent] = sub.orderId ? await db.select().from(renewalConsents).where(eq(renewalConsents.orderId, sub.orderId)).limit(1) : [];
  if (!plan || !teacher || !person) return null;
  const templates = await activeTemplates();
  const legal = await contextLegal();
  const mail = acknowledgmentMail({
    firstName: firstName(person.name),
    membershipName: plan.name,
    teacherName: teacher.studioName || "Teacher",
    benefits: benefitsSummary(plan),
    start: sub.currentPeriodStart,
    amountChargedCents: order?.studentPaysCents ?? plan.priceCents,
    taxCents: 0,
    cardBrand: sub.cardBrand || "card",
    last4: sub.cardLast4 || "••••",
    termMonths: plan.termMonths,
    renewalPriceCents: sub.renewalPriceCents > 0 ? sub.renewalPriceCents : plan.priceCents,
    nextRenewal: sub.currentPeriodEnd,
    introEndsAt: sub.introEndsAt,
    policyText: plan.pauseCancelPolicy,
    policyUrl: `${legal.siteUrl}/t/${teacher.slug}/m/${plan.slug}`,
    cancelUrl: `${legal.siteUrl}/account/memberships/${sub.id}/cancel`,
  }, templates, legal);
  return { sub, plan, teacher, person, consent, mail, legal };
}

async function loadCancelTarget(subscriptionId: string) {
  const [sub] = await db.select().from(membershipSubscriptions).where(eq(membershipSubscriptions.id, subscriptionId)).limit(1);
  if (!sub) return null;
  const [plan] = await db.select().from(memberships).where(eq(memberships.id, sub.membershipId)).limit(1);
  const [teacher] = plan ? await db.select().from(teachers).where(eq(teachers.id, plan.teacherId)).limit(1) : [];
  const [person] = await db.select().from(user).where(eq(user.id, sub.userId)).limit(1);
  const [order] = sub.orderId ? await db.select().from(orders).where(eq(orders.id, sub.orderId)).limit(1) : [];
  if (!plan || !teacher || !person) return null;
  return { sub, plan, teacher, person, order };
}

export async function cancelMembership(input: {
  subscriptionId: string;
  actorUserId: string;
  source: "member" | "admin" | "account_deletion" | "teacher";
  platform?: string;
  ip?: string | null;
  userAgent?: string | null;
}) {
  const loaded = await loadCancelTarget(input.subscriptionId);
  if (!loaded) return { error: "Membership not found." };
  if (input.source === "teacher") {
    if (loaded.teacher.userId !== input.actorUserId) return { error: "Membership not found." };
  } else if (input.source !== "admin" && loaded.sub.userId !== input.actorUserId) return { error: "Membership not found." };
  const templates = await activeTemplates();
  const legal = await contextLegal();
  const screen = cancellationScreen(loaded.plan.name, loaded.sub.currentPeriodEnd, templates, legal);
  if (loaded.sub.cancelAtPeriodEnd || loaded.sub.status === "cancelled") {
    return { ok: true as const, already: true, screen, termEnd: loaded.sub.currentPeriodEnd, membershipName: loaded.plan.name };
  }
  if (loaded.order?.stripeSubscriptionId) {
    try {
      const stopped = await stopSubscriptionRenewal(loaded.order.stripeSubscriptionId);
      if (!stopped.ok && stopped.reason !== "unconfigured") return { error: "Could not stop the renewal with the card processor. Nothing was cancelled." };
    } catch {
      return { error: "Could not stop the renewal with the card processor. Nothing was cancelled." };
    }
  }
  const now = new Date();
  await db.update(membershipSubscriptions).set({ cancelAtPeriodEnd: true, cancelledAt: now }).where(eq(membershipSubscriptions.id, loaded.sub.id));
  const mail = cancellationMail({
    firstName: firstName(loaded.person.name),
    membershipName: loaded.plan.name,
    teacherName: loaded.teacher.studioName || "Teacher",
    cancelDate: now,
    termEnd: loaded.sub.currentPeriodEnd,
  }, templates, legal);
  let emailId: string | null = null;
  let delivery = "skipped";
  if (loaded.person.email && !loaded.person.email.endsWith("@users.invalid")) {
    const sent = await sendEmail({ to: [loaded.person.email], subject: mail.subject, text: mail.text, html: mail.html, teacherId: loaded.teacher.id });
    emailId = sent.id;
    delivery = sent.ok ? "sent" : "failed";
    if (!sent.ok) await alertOps(`Cancellation email failed for membership ${loaded.sub.id}.`);
  }
  await db.insert(renewalCancellations).values({
    id: crypto.randomUUID(),
    userId: loaded.sub.userId,
    membershipId: loaded.plan.id,
    teacherId: loaded.teacher.id,
    subscriptionId: loaded.sub.id,
    actorUserId: input.actorUserId,
    source: input.source,
    platform: input.platform || "web",
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
    termEnd: loaded.sub.currentPeriodEnd,
    emailId,
    deliveryStatus: delivery,
  });
  await rememberInApp(loaded.sub.userId, mail.subject, screen, `/account/memberships/${loaded.sub.id}/cancel`);
  return { ok: true as const, already: false, screen, termEnd: loaded.sub.currentPeriodEnd, membershipName: loaded.plan.name, summary: confirmationSummary(loaded.sub.currentPeriodEnd, templates, legal) };
}

export async function renewalsEndingWithAccount(userId: string) {
  const rows = await db
    .select({ sub: membershipSubscriptions, plan: memberships })
    .from(membershipSubscriptions)
    .innerJoin(memberships, eq(memberships.id, membershipSubscriptions.membershipId))
    .where(and(eq(membershipSubscriptions.userId, userId), eq(membershipSubscriptions.cancelAtPeriodEnd, false), ne(membershipSubscriptions.status, "cancelled")));
  return rows.map((row) => ({ id: row.sub.id, name: row.plan.name, ends: row.sub.currentPeriodEnd }));
}

export async function cancelRenewalsForAccountDeletion(userId: string) {
  const ending = await renewalsEndingWithAccount(userId);
  for (const row of ending) {
    const result = await cancelMembership({ subscriptionId: row.id, actorUserId: userId, source: "account_deletion", platform: "web" });
    if ("error" in result && result.error) return { ok: false as const, error: result.error };
  }
  return { ok: true as const, ended: ending };
}

export async function scheduleMembershipPriceChange(input: { membershipId: string; newPriceCents: number; effectiveAt: Date; actorUserId: string; minDays?: number }) {
  const minDays = input.minDays ?? PRICE_CHANGE_MIN_DAYS_BACKEND;
  const error = priceChangeDateError(new Date(), input.effectiveAt, minDays);
  if (error) return { error };
  if (input.newPriceCents <= 0) return { error: "Enter a price." };
  const [plan] = await db.select().from(memberships).where(eq(memberships.id, input.membershipId)).limit(1);
  if (!plan) return { error: "Membership not found." };
  await db.insert(membershipPriceChanges).values({
    id: crypto.randomUUID(),
    membershipId: plan.id,
    oldPriceCents: plan.priceCents,
    newPriceCents: input.newPriceCents,
    effectiveAt: input.effectiveAt,
    createdBy: input.actorUserId,
  });
  return { ok: true as const };
}

export async function scheduleMaterialChange(input: { membershipId: string; summary: string; effectiveAt: Date; actorUserId: string }) {
  const error = priceChangeDateError(new Date(), input.effectiveAt, MATERIAL_CHANGE_MIN_DAYS);
  if (error) return { error };
  if (!input.summary.trim()) return { error: "Describe the change." };
  const [plan] = await db.select().from(memberships).where(eq(memberships.id, input.membershipId)).limit(1);
  if (!plan) return { error: "Membership not found." };
  await db.insert(membershipMaterialChanges).values({
    id: crypto.randomUUID(),
    membershipId: plan.id,
    summary: input.summary.trim(),
    effectiveAt: input.effectiveAt,
    createdBy: input.actorUserId,
  });
  return { ok: true as const };
}

export async function saveRenewalTemplate(input: { actorUserId: string; legalSignoff: string; body: Partial<RenewalTemplates> }) {
  if (input.legalSignoff.trim().length < 3) return { error: "Legal sign-off is required before this copy can change." };
  const version = `arl-${new Date().toISOString().slice(0, 10)}-${crypto.randomUUID().slice(0, 8)}`;
  await db.update(renewalTemplates).set({ active: false }).where(eq(renewalTemplates.active, true));
  await db.insert(renewalTemplates).values({
    id: crypto.randomUUID(),
    version,
    active: true,
    legalSignoff: input.legalSignoff.trim(),
    createdBy: input.actorUserId,
    body: input.body as Record<string, string>,
  });
  return { ok: true as const, version };
}

function handled(rows: { kind: string; eventOn: string; status: string }[], kind: NoticeKind, eventOn: string) {
  return rows.some((row) => row.kind === kind && row.eventOn === eventOn && row.status === "sent");
}

async function pauseUnnoticedRenewal(subscriptionId: string, stripeSubscriptionId: string | null) {
  if (stripeSubscriptionId) {
    try {
      const stopped = await stopSubscriptionRenewal(stripeSubscriptionId);
      if (!stopped.ok && stopped.reason !== "unconfigured") {
        await alertOps(`Stripe did not confirm cancel_at_period_end for subscription ${subscriptionId}. The renewal is paused locally so it is not extended.`);
      }
    } catch {
      await alertOps(`Stripe did not confirm cancel_at_period_end for subscription ${subscriptionId}. The renewal is paused locally so it is not extended.`);
    }
  }
  await db.update(membershipSubscriptions).set({ cancelAtPeriodEnd: true, cancelledAt: new Date() }).where(eq(membershipSubscriptions.id, subscriptionId));
}

export async function scheduleRenewalNotices(now = new Date()) {
  let sent = 0;
  let missed = 0;
  const subs = await db.select().from(membershipSubscriptions).where(and(ne(membershipSubscriptions.status, "cancelled"), eq(membershipSubscriptions.cancelAtPeriodEnd, false)));
  if (!subs.length) return { sent, missed };
  const planIds = [...new Set(subs.map((sub) => sub.membershipId))];
  const plans = await db.select().from(memberships).where(inArray(memberships.id, planIds));
  const planById = new Map(plans.map((plan) => [plan.id, plan]));
  const teacherIds = [...new Set(plans.map((plan) => plan.teacherId))];
  const studioRows = teacherIds.length ? await db.select().from(teachers).where(inArray(teachers.id, teacherIds)) : [];
  const teacherById = new Map(studioRows.map((teacher) => [teacher.id, teacher]));
  const userIds = [...new Set(subs.map((sub) => sub.userId))];
  const people = await db.select().from(user).where(inArray(user.id, userIds));
  const personById = new Map(people.map((person) => [person.id, person]));
  const subIds = subs.map((sub) => sub.id);
  const notices = await db.select().from(renewalNotices).where(inArray(renewalNotices.subscriptionId, subIds));
  const priceChanges = await db.select().from(membershipPriceChanges).where(inArray(membershipPriceChanges.membershipId, planIds)).orderBy(asc(membershipPriceChanges.effectiveAt));
  const materialChanges = await db.select().from(membershipMaterialChanges).where(inArray(membershipMaterialChanges.membershipId, planIds)).orderBy(asc(membershipMaterialChanges.effectiveAt));
  const templates = await activeTemplates();
  const legal = await contextLegal();
  const ordersById = new Map<string, typeof orders.$inferSelect>();
  const orderIds = subs.map((sub) => sub.orderId).filter((id): id is string => Boolean(id));
  if (orderIds.length) {
    const orderRows = await db.select().from(orders).where(inArray(orders.id, orderIds));
    for (const order of orderRows) ordersById.set(order.id, order);
  }

  for (const change of priceChanges) {
    if (change.effectiveAt <= now) {
      const later = priceChanges.some((other) => other.membershipId === change.membershipId && other.effectiveAt > change.effectiveAt && other.effectiveAt <= now);
      if (!later) await db.update(memberships).set({ priceCents: change.newPriceCents }).where(eq(memberships.id, change.membershipId));
    }
  }

  for (const sub of subs) {
    const plan = planById.get(sub.membershipId);
    const teacher = plan ? teacherById.get(plan.teacherId) : undefined;
    const person = personById.get(sub.userId);
    if (!plan || !teacher || !person) continue;
    const mine = notices.filter((notice) => notice.subscriptionId === sub.id);
    const price = priceChanges.find((change) => change.membershipId === plan.id && !handled(mine, "price_change", isoDate(change.effectiveAt))) ?? priceChanges.filter((change) => change.membershipId === plan.id).at(-1) ?? null;
    const material = materialChanges.find((change) => change.membershipId === plan.id && !handled(mine, "material_change", isoDate(change.effectiveAt))) ?? null;
    const decisions = planNotices({
      now,
      termMonths: plan.termMonths,
      startedAt: sub.currentPeriodStart,
      periodEnd: sub.currentPeriodEnd,
      introEndsAt: sub.introEndsAt,
      introDays: plan.introDays,
      introPriceCents: plan.introPriceCents,
      priceChange: price ? { effectiveAt: price.effectiveAt, sent: handled(mine, "price_change", isoDate(price.effectiveAt)) } : null,
      materialChange: material ? { effectiveAt: material.effectiveAt, sent: false } : null,
      annualSentFor: mine.filter((notice) => notice.kind === "annual").map((notice) => notice.eventOn),
      preRenewalSent: handled(mine, "pre_renewal", isoDate(sub.currentPeriodEnd)),
      introSent: sub.introEndsAt ? handled(mine, "intro_ending", isoDate(sub.introEndsAt)) : false,
    });
    const cancelUrl = `${legal.siteUrl}/account/memberships/${sub.id}/cancel`;
    const pauseReasons: string[] = [];
    let priceFallback = false;
    for (const decision of decisions) {
      if (decision.action === "wait") continue;
      const eventOn = isoDate(decision.eventAt);
      if (handled(mine, decision.kind, eventOn)) continue;
      const prior = mine.find((notice) => notice.kind === decision.kind && notice.eventOn === eventOn);
      const renewalPrice = sub.renewalPriceCents > 0 ? sub.renewalPriceCents : plan.priceCents;
      const mail = noticeMail({
        kind: decision.kind,
        firstName: firstName(person.name),
        membershipName: plan.name,
        teacherName: teacher.studioName || "Teacher",
        benefits: benefitsSummary(plan),
        termMonths: plan.termMonths,
        renewalPriceCents: decision.kind === "price_change" && price ? price.newPriceCents : renewalPrice,
        oldPriceCents: price?.oldPriceCents ?? renewalPrice,
        newPriceCents: price?.newPriceCents ?? renewalPrice,
        cardBrand: sub.cardBrand || "card",
        last4: sub.cardLast4 || "••••",
        eventAt: decision.eventAt,
        nextRenewal: sub.currentPeriodEnd,
        startedAt: sub.currentPeriodStart,
        cancelUrl,
        changeSummary: material?.summary || "",
        priceStays: !(price && decision.kind === "material_change"),
      }, templates, legal);
      if (decision.action === "missed" || prior?.status === "missed") {
        if (!prior) {
          const inserted = await db.insert(renewalNotices).values({
            id: crypto.randomUUID(),
            userId: sub.userId,
            membershipId: plan.id,
            teacherId: teacher.id,
            subscriptionId: sub.id,
            kind: decision.kind,
            eventOn,
            status: "missed",
            subject: mail.subject,
            body: mail.text,
            detail: noticeAlert(decision.kind, `${decision.daysBefore.toFixed(1)} days before ${eventOn}`, missedNoticeSkipsCharge(decision.kind)),
          }).onConflictDoNothing().returning();
          if (inserted.length) missed += 1;
        } else if (prior.status !== "missed") {
          await db.update(renewalNotices).set({
            status: "missed",
            detail: noticeAlert(decision.kind, `${decision.daysBefore.toFixed(1)} days before ${eventOn}`, missedNoticeSkipsCharge(decision.kind)),
          }).where(eq(renewalNotices.id, prior.id));
          missed += 1;
        }
        if (missedNoticeSkipsCharge(decision.kind)) pauseReasons.push(noticeAlert(decision.kind, `subscription ${sub.id} on ${eventOn}`, true));
        else if (decision.kind === "price_change") priceFallback = true;
        else await alertOps(noticeAlert(decision.kind, `subscription ${sub.id} on ${eventOn}`));
        continue;
      }
      let emailId: string | null = null;
      let delivery = "skipped";
      let status: "sent" | "failed" = "failed";
      if (person.email && !person.email.endsWith("@users.invalid")) {
        const result = await sendEmail({ to: [person.email], subject: mail.subject, text: mail.text, html: mail.html, teacherId: teacher.id });
        emailId = result.id;
        delivery = result.ok ? "sent" : "failed";
        status = result.ok ? "sent" : "failed";
      }
      if (prior) {
        await db.update(renewalNotices).set({
          sentAt: status === "sent" ? now : null,
          status,
          emailId,
          deliveryStatus: delivery,
          subject: mail.subject,
          body: mail.text,
        }).where(eq(renewalNotices.id, prior.id));
      } else {
        const inserted = await db.insert(renewalNotices).values({
          id: crypto.randomUUID(),
          userId: sub.userId,
          membershipId: plan.id,
          teacherId: teacher.id,
          subscriptionId: sub.id,
          kind: decision.kind,
          eventOn,
          sentAt: status === "sent" ? now : null,
          status,
          emailId,
          deliveryStatus: delivery,
          subject: mail.subject,
          body: mail.text,
        }).onConflictDoNothing().returning();
        if (!inserted.length) continue;
      }
      if (status === "sent") sent += 1;
      if (status === "sent" && decision.kind === "price_change" && price) {
        await db.update(membershipPriceChanges).set({ noticeSentAt: now }).where(eq(membershipPriceChanges.id, price.id));
        price.noticeSentAt = now;
      }
      if (status === "sent" && decision.kind === "material_change" && material) {
        await db.update(membershipMaterialChanges).set({ noticeSentAt: now }).where(eq(membershipMaterialChanges.id, material.id));
      }
      await rememberInApp(person.id, mail.subject, mail.text.slice(0, 240), `/account/memberships/${sub.id}/cancel`);
      if (status === "failed" && !prior) await alertOps(noticeAlert(decision.kind, `email failed for subscription ${sub.id}`));
    }

    const applicable = [...priceChanges].reverse().find((change) => change.membershipId === plan.id && change.effectiveAt <= sub.currentPeriodEnd);
    const priced = priceAfterNotice({
      lockedPriceCents: sub.renewalPriceCents,
      catalogPriceCents: plan.priceCents,
      change: applicable ? { newPriceCents: applicable.newPriceCents, effectiveAt: applicable.effectiveAt, noticeSentAt: applicable.noticeSentAt } : null,
      renewsAt: sub.currentPeriodEnd,
      now,
    });
    if (pauseReasons.length) {
      const stripeId = sub.orderId ? ordersById.get(sub.orderId)?.stripeSubscriptionId ?? null : null;
      await pauseUnnoticedRenewal(sub.id, stripeId);
      await alertOps(`${pauseReasons.join(" ")} Subscription ${sub.id} is set to cancel at period end.`);
      continue;
    }
    if (priceFallback) {
      await alertOps(`The price-change notice for subscription ${sub.id} was not sent in its window. The renewal will be charged at the previous price.`);
    }
    const locked = sub.renewalPriceCents > 0 ? sub.renewalPriceCents : plan.priceCents;
    if (!priced.blockedNewPrice && priced.priceCents !== locked && priced.priceCents > 0) {
      const stripeId = sub.orderId ? ordersById.get(sub.orderId)?.stripeSubscriptionId : null;
      let applied = !stripeId;
      if (stripeId) {
        try {
          const updated = await setSubscriptionRenewalAmount(stripeId, priced.priceCents);
          applied = updated.ok || updated.reason === "unconfigured";
          if (!updated.ok && updated.reason !== "unconfigured") await alertOps(`Could not apply the noticed price for subscription ${sub.id}. Check it before the renewal.`);
        } catch {
          applied = false;
          await alertOps(`Could not apply the noticed price for subscription ${sub.id}. Check it before the renewal.`);
        }
      }
      if (applied) await db.update(membershipSubscriptions).set({ renewalPriceCents: priced.priceCents }).where(eq(membershipSubscriptions.id, sub.id));
    }
  }
  return { sent, missed };
}

export async function teacherMembershipRoster(teacherId: string) {
  return db
    .select({
      id: membershipSubscriptions.id,
      membershipId: membershipSubscriptions.membershipId,
      name: user.name,
      status: membershipSubscriptions.status,
      cancelAtPeriodEnd: membershipSubscriptions.cancelAtPeriodEnd,
      currentPeriodEnd: membershipSubscriptions.currentPeriodEnd,
    })
    .from(membershipSubscriptions)
    .innerJoin(user, eq(user.id, membershipSubscriptions.userId))
    .where(and(eq(membershipSubscriptions.teacherId, teacherId), ne(membershipSubscriptions.status, "cancelled")))
    .orderBy(asc(user.name));
}

export async function listRenewalSubscriptions(limit = 50) {
  return db
    .select({ sub: membershipSubscriptions, plan: memberships, person: user })
    .from(membershipSubscriptions)
    .innerJoin(memberships, eq(memberships.id, membershipSubscriptions.membershipId))
    .innerJoin(user, eq(user.id, membershipSubscriptions.userId))
    .where(ne(membershipSubscriptions.status, "cancelled"))
    .limit(limit);
}

export { dunningBody, confirmationSummary };
