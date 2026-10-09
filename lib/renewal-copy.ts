import { createHash } from "node:crypto";
import { appOrigin } from "@/lib/env";

/** California ARL (AB 2863) + ROSCA copy. [PLATFORM NAME] and the other bracketed fields stay configurable. */
export const BUILTIN_TEMPLATE_VERSION = "arl-2026-07-v2";

export const CONSENT_REQUIRED_ERROR = "Please confirm you agree to automatic renewal to start your membership.";
export const DISCLOSURE_CHANGED_ERROR = "The renewal terms changed. Review them and confirm again.";

export const PRICE_CHANGE_MIN_DAYS_BACKEND = 8;
export const PRICE_CHANGE_MIN_DAYS_TEACHER = 14;
export const MATERIAL_CHANGE_MIN_DAYS = 30;

export const NOTICE_WINDOWS = {
  preRenewal: { targetDays: 30, minDays: 15, maxDays: 45 },
  introLong: { targetDays: 7, minDays: 3, maxDays: 21 },
  introShort: { targetDays: 3, minDays: 3, maxDays: 21 },
  priceChange: { targetDays: 21, minDays: 7, maxDays: 30 },
  materialChange: { targetDays: 30, minDays: 30, maxDays: 45 },
  annualLateDays: 7,
} as const;

export type LegalIdentity = {
  platformName: string;
  companyLegalName: string;
  mailingAddress: string;
  contactEmail: string;
  notificationsEmail: string;
  siteUrl: string;
};

export type RenewalTemplates = {
  version: string;
  disclosureTitle: string;
  disclosureCharge: string;
  disclosureIntro: string;
  disclosureCancel: string;
  disclosureCommitment: string;
  disclosurePrice: string;
  checkbox: string;
  termsLine: string;
  ackSubject: string;
  ackBody: string;
  cancelSubject: string;
  cancelBody: string;
  cancelScreen: string;
  preRenewalSubject: string;
  preRenewalBody: string;
  introSubject: string;
  introBody: string;
  priceSubject: string;
  priceBody: string;
  materialSubject: string;
  materialBody: string;
  annualSubject: string;
  annualBody: string;
  confirmSummary: string;
};

export const BUILTIN_TEMPLATES: RenewalTemplates = {
  version: BUILTIN_TEMPLATE_VERSION,
  disclosureTitle: "Auto-renewing membership: {{membership_name}} with {{teacher_name}}",
  disclosureCharge:
    "You'll be charged {{price}} today. Your membership automatically renews every {{term_length}}, and we'll charge {{renewal_price}} plus any applicable tax to your {{card_brand}} ending in {{last4}} at the start of each renewal term, starting {{first_renewal_date}}, until you cancel.",
  disclosureIntro:
    "Your {{intro_length}} intro {{intro_price_phrase}}. Starting {{intro_end_date}}, you'll be charged {{renewal_price}} every {{term_length}} until you cancel. To avoid being charged, cancel before {{intro_end_date}} at Account › Memberships › Cancel membership.",
  disclosureCancel:
    "Cancel anytime online: Account › Memberships › Cancel membership, in the app or at {{site_url}}/account/memberships. Cancelling stops future charges; you keep access until {{current_term_end_date}}. {{refund_line}}",
  disclosureCommitment: "{{minimum_commitment_line}}",
  disclosurePrice:
    "Price changes: we'll email you at least 7 days before any price change takes effect. If a required renewal notice is not sent in its window, that renewal is not charged.",
  checkbox:
    "I agree that my {{membership_name}} membership will automatically renew every {{term_length}} at {{renewal_price}} plus tax, charged to my payment method, until I cancel. I understand I can cancel anytime online in Account › Memberships.",
  termsLine: "By purchasing, you also agree to the Terms of Service and {{teacher_name}}'s cancellation policy.",
  ackSubject: "Your {{membership_name}} membership is active: renewal details and how to cancel",
  ackBody: `Hi {{first_name}},

Thanks for joining {{membership_name}} with {{teacher_name}}. Here are your membership details. Please keep this email for your records.

Your auto-renewal terms
- Membership: {{membership_name}} ({{benefits_summary}})
- Started: {{start_date}}
- Charged today: {{amount_charged}} (including {{tax_amount}} tax) to {{card_brand}} ending in {{last4}}
- Renews automatically every {{term_length}} at {{renewal_price}} plus any applicable tax, until you cancel.
- Next charge: {{renewal_price}} on {{next_renewal_date}}.
{{intro_line}}
- Minimum commitment: {{minimum_commitment_or_none}}

How to cancel
Cancel anytime online in a few taps: open the app or go to {{site_url}}/account/memberships, choose {{membership_name}}, and tap Cancel membership. You don't need to contact {{teacher_name}} or us. Cancelling stops all future charges, and you keep access until the end of the term you've paid for.
Cancel membership: {{cancel_url}}

Cancellation and refund policy
{{teacher_policy_summary}} Full policy: {{teacher_policy_url}}

Price changes
If the price ever changes, we'll email you at least 7 days (and no more than 30 days) before the new price takes effect, so you have time to cancel. If a required renewal notice is not sent in its window, that renewal is not charged.

Questions? Reply to this email or contact {{teacher_name}} through the app.

[PLATFORM NAME] · [COMPANY LEGAL NAME] · [MAILING ADDRESS] · [CONTACT EMAIL]
Terms of Service: {{terms_url}} · Privacy Policy: {{privacy_url}}`,
  cancelSubject: "Cancellation confirmed: {{membership_name}}",
  cancelBody: `Hi {{first_name}}, this confirms you cancelled your {{membership_name}} membership with {{teacher_name}} on {{cancel_date}}. You will not be charged again. You can keep using your membership until {{current_term_end_date}}. Changed your mind? You can rejoin anytime from {{teacher_name}}'s page.
[PLATFORM NAME] · [MAILING ADDRESS] · [CONTACT EMAIL]`,
  cancelScreen: "You've cancelled {{membership_name}}. You won't be charged again. Your access continues until {{current_term_end_date}}.",
  preRenewalSubject: "Your {{membership_name}} membership renews on {{renewal_date}}",
  preRenewalBody: `Hi {{first_name}}, your 12-month {{membership_name}} membership with {{teacher_name}} will automatically renew on {{renewal_date}} for another 12 months, and we'll charge {{renewal_price}} plus any applicable tax to your {{card_brand}} ending in {{last4}}. If you don't want to renew, cancel before {{renewal_date}}: Cancel membership ({{cancel_url}}) or go to Account › Memberships in the app or at {{site_url}}. {{refund_line}}

What it includes: {{benefits_summary}}
How often you're charged: every {{term_length}}
How much: {{renewal_price}} plus any applicable tax, to your {{card_brand}} ending in {{last4}}. Next charge: {{next_renewal_date}}.
How to cancel: anytime online at Account › Memberships › Cancel membership, or {{cancel_url}}. Cancelling stops future charges, and you keep access until the end of your paid term.`,
  introSubject: "Your intro to {{membership_name}} ends {{intro_end_date}}",
  introBody:
    "Hi {{first_name}}, your intro period for {{membership_name}} ends on {{intro_end_date}}. After that, your membership automatically continues at {{renewal_price}} every {{term_length}}, charged to your {{card_brand}} ending in {{last4}}, until you cancel. To avoid being charged, cancel before {{intro_end_date}}: Cancel membership ({{cancel_url}}).",
  priceSubject: "Price change for your {{membership_name}} membership",
  priceBody:
    "Hi {{first_name}}, {{teacher_name}} is changing the price of {{membership_name}} from {{old_price}} to {{new_price}} every {{term_length}}, starting with your renewal on {{effective_date}}. Nothing changes before then. If you don't want to continue at the new price, cancel anytime before {{effective_date}}: Cancel membership ({{cancel_url}}) or Account › Memberships. If you do nothing, your membership will renew at {{new_price}} plus any applicable tax.",
  materialSubject: "Changes to your {{membership_name}} membership",
  materialBody:
    "Hi {{first_name}}, starting {{effective_date}}, {{teacher_name}} is making these changes to {{membership_name}}: {{change_summary}}. Your price {{price_phrase}}. If you'd rather not continue, cancel anytime: Cancel membership ({{cancel_url}}).",
  annualSubject: "Your yearly membership reminder: {{membership_name}}",
  annualBody: `Hi {{first_name}}, here's your yearly reminder about your {{membership_name}} membership with {{teacher_name}}, which you started on {{start_date}}.
- What it includes: {{benefits_summary}}
- How often you're charged: every {{term_length}}
- How much: {{renewal_price}} plus any applicable tax, to your {{card_brand}} ending in {{last4}}. Next charge: {{next_renewal_date}}.
- How to cancel: anytime online at Account › Memberships › Cancel membership, or {{cancel_url}}. Cancelling stops future charges, and you keep access until the end of your paid term.`,
  confirmSummary: "Your membership will end on {{current_term_end_date}}. You won't be charged again.",
};

export function legalIdentity(partial?: Partial<LegalIdentity>): LegalIdentity {
  return {
    platformName: partial?.platformName || process.env.PLATFORM_NAME || "BeCreative",
    companyLegalName: partial?.companyLegalName || process.env.COMPANY_LEGAL_NAME || "[COMPANY LEGAL NAME]",
    mailingAddress: partial?.mailingAddress || process.env.MAILING_ADDRESS || "[MAILING ADDRESS]",
    contactEmail: partial?.contactEmail || process.env.CONTACT_EMAIL || "[CONTACT EMAIL]",
    notificationsEmail: partial?.notificationsEmail || process.env.NOTIFICATIONS_EMAIL || process.env.SES_FROM_EMAIL || "[NOTIFICATIONS EMAIL]",
    siteUrl: (partial?.siteUrl || appOrigin()).replace(/\/$/, ""),
  };
}

export function applyLegal(text: string, legal: LegalIdentity) {
  return text
    .replaceAll("[PLATFORM NAME]", legal.platformName)
    .replaceAll("[COMPANY LEGAL NAME]", legal.companyLegalName)
    .replaceAll("[MAILING ADDRESS]", legal.mailingAddress)
    .replaceAll("[CONTACT EMAIL]", legal.contactEmail)
    .replaceAll("[NOTIFICATIONS EMAIL]", legal.notificationsEmail);
}

export function fillTemplate(template: string, vars: Record<string, string>, legal: LegalIdentity) {
  let text = template;
  for (const [key, value] of Object.entries(vars)) text = text.replaceAll(`{{${key}}}`, value);
  text = applyLegal(text, legal);
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

export function mergeTemplates(override?: Partial<RenewalTemplates> | null): RenewalTemplates {
  return { ...BUILTIN_TEMPLATES, ...(override ?? {}), version: override?.version || BUILTIN_TEMPLATES.version };
}

export function termLengthLabel(months: number) {
  return months === 1 ? "1 month" : `${months} months`;
}

export function termUnitLabel(months: number) {
  if (months === 1) return "month";
  if (months === 12) return "year";
  return `${months} months`;
}

export function introLengthLabel(days: number) {
  if (days >= 30 && days % 30 === 0) {
    const months = days / 30;
    return months === 1 ? "1-month" : `${months}-month`;
  }
  return `${days}-day`;
}

export function formatRenewalDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", month: "long", day: "numeric", year: "numeric" }).format(date);
}

export function addLocalMonths(date: Date, months: number) {
  const next = new Date(date.getTime());
  next.setMonth(next.getMonth() + months);
  return next;
}

export function daysBetween(from: Date, to: Date) {
  return (to.getTime() - from.getTime()) / 86_400_000;
}

export function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function refundLine(teacherName: string) {
  return `Payments already made are not refunded, except as described in ${teacherName}'s cancellation policy or required by law.`;
}

export function minimumCommitmentLine() {
  return "No minimum commitment.";
}

export function benefitsSummary(input: { kind: string; classesPerPeriod: number | null }) {
  if (input.kind === "unlimited" || input.classesPerPeriod == null) return "Unlimited classes";
  return `${input.classesPerPeriod} classes per period`;
}

export function firstName(name: string | null | undefined) {
  const part = (name ?? "").trim().split(/\s+/)[0];
  return part || "there";
}

export type MembershipOfferInput = {
  priceCents: number;
  termMonths: number;
  recurring: boolean;
  introDays: number | null;
  introPriceCents: number | null;
  now: Date;
};

export function membershipOffer(input: MembershipOfferInput) {
  const intro = input.introDays && input.introDays > 0 ? { days: input.introDays, priceCents: input.introPriceCents ?? 0 } : null;
  const todayCents = intro ? intro.priceCents : input.priceCents;
  const renewalCents = input.priceCents;
  const periodEnd = intro ? new Date(input.now.getTime() + intro.days * 86_400_000) : addLocalMonths(input.now, input.termMonths);
  const trialDays = intro && input.recurring && renewalCents > 0 ? intro.days : 0;
  const chargeLater = Boolean(intro && todayCents === 0 && renewalCents > 0 && input.recurring);
  return { intro, todayCents, renewalCents, periodEnd, trialDays, chargeLater };
}

export function moneyLabel(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export function purchaseButtonLabel(input: { todayCents: number; renewalCents: number; termMonths: number; introFree: boolean }) {
  if (input.introFree) return `Start free intro, then ${moneyLabel(input.renewalCents)}/${termUnitLabel(input.termMonths)}`;
  return `Start membership: ${moneyLabel(input.todayCents)} today`;
}

export type DisclosureSegment = { text: string; href?: string };
export type DisclosureLine = { bold: boolean; segments: DisclosureSegment[] };

export type DisclosureFacts = {
  membershipName: string;
  teacherName: string;
  teacherSlug: string;
  membershipSlug: string;
  priceCents: number;
  renewalPriceCents: number;
  termMonths: number;
  now: Date;
  periodEnd: Date;
  intro: { days: number; priceCents: number } | null;
  cardBrand: string;
  last4: string;
  policyText: string;
};

export type DisclosureView = {
  version: string;
  templateVersion: string;
  canonical: string;
  lines: DisclosureLine[];
  checkbox: string;
  termsLine: string;
  termsUrl: string;
  privacyUrl: string;
  policyUrl: string;
  buttonLabel: string;
  consentRequired: boolean;
  priceCents: number;
  renewalPriceCents: number;
  termMonths: number;
  firstRenewalDate: string;
  cardBrand: string;
  last4: string;
};

function line(bold: boolean, text: string, link?: { label: string; href: string }): DisclosureLine {
  if (!link) return { bold, segments: [{ text }] };
  const at = text.indexOf(link.label);
  if (at < 0) return { bold, segments: [{ text }, { text: ` ${link.label}`, href: link.href }] };
  return {
    bold,
    segments: [
      { text: text.slice(0, at) },
      { text: link.label, href: link.href },
      { text: text.slice(at + link.label.length) },
    ].filter((segment) => segment.text.length > 0),
  };
}

export function disclosureHash(version: string, canonical: string) {
  return createHash("sha256").update(`${version}\n${canonical}`).digest("hex");
}

export function buildDisclosure(facts: DisclosureFacts, templates: RenewalTemplates, legal: LegalIdentity): DisclosureView {
  const todayCents = facts.priceCents;
  const renewal = moneyLabel(facts.renewalPriceCents);
  const end = formatRenewalDate(facts.periodEnd);
  const policyUrl = `${legal.siteUrl}/t/${facts.teacherSlug}/m/${facts.membershipSlug}`;
  const introPhrase = facts.intro ? (facts.intro.priceCents === 0 ? "is free" : `costs ${moneyLabel(facts.intro.priceCents)}`) : "";
  const vars: Record<string, string> = {
    membership_name: facts.membershipName,
    teacher_name: facts.teacherName,
    price: moneyLabel(todayCents),
    renewal_price: renewal,
    term_length: termLengthLabel(facts.termMonths),
    term_unit: termUnitLabel(facts.termMonths),
    first_renewal_date: end,
    current_term_end_date: end,
    card_brand: facts.cardBrand || "card",
    last4: facts.last4 || "••••",
    site_url: legal.siteUrl,
    refund_line: refundLine(facts.teacherName),
    minimum_commitment_line: minimumCommitmentLine(),
    intro_length: facts.intro ? introLengthLabel(facts.intro.days) : "",
    intro_price_phrase: introPhrase,
    intro_end_date: end,
  };
  const lines: DisclosureLine[] = [];
  if (facts.intro) lines.push(line(true, fillTemplate(templates.disclosureIntro, vars, legal)));
  lines.push(line(true, fillTemplate(templates.disclosureTitle, vars, legal)));
  lines.push(line(true, fillTemplate(templates.disclosureCharge, vars, legal)));
  const cancelText = fillTemplate(templates.disclosureCancel, vars, legal);
  lines.push(line(false, cancelText, { label: "cancellation policy", href: policyUrl }));
  lines.push(line(false, fillTemplate(templates.disclosureCommitment, vars, legal)));
  lines.push(line(false, fillTemplate(templates.disclosurePrice, vars, legal)));
  const checkbox = fillTemplate(templates.checkbox, vars, legal);
  const canonical = [...lines.map((item) => item.segments.map((segment) => segment.text).join("")), checkbox].join("\n");
  const introFree = Boolean(facts.intro && facts.intro.priceCents === 0);
  return {
    version: disclosureHash(templates.version, canonical),
    templateVersion: templates.version,
    canonical,
    lines,
    checkbox,
    termsLine: fillTemplate(templates.termsLine, vars, legal),
    termsUrl: `${legal.siteUrl}/legal/terms`,
    privacyUrl: `${legal.siteUrl}/legal/privacy`,
    policyUrl,
    buttonLabel: purchaseButtonLabel({ todayCents, renewalCents: facts.renewalPriceCents, termMonths: facts.termMonths, introFree }),
    consentRequired: true,
    priceCents: todayCents,
    renewalPriceCents: facts.renewalPriceCents,
    termMonths: facts.termMonths,
    firstRenewalDate: end,
    cardBrand: vars.card_brand,
    last4: vars.last4,
  };
}

export function consentAccepted(input: { recurring: boolean; consent: boolean; disclosureVersion: string; expectedVersion: string }) {
  if (!input.recurring) return { ok: true as const };
  if (!input.consent) return { ok: false as const, error: CONSENT_REQUIRED_ERROR };
  if (input.disclosureVersion !== input.expectedVersion) return { ok: false as const, error: DISCLOSURE_CHANGED_ERROR };
  return { ok: true as const };
}

export type MailCopy = { subject: string; text: string; html: string };

function htmlEscape(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function mailHtml(text: string, legal: LegalIdentity) {
  const body = htmlEscape(text)
    .split(/\n{2,}/)
    .map((paragraph) => `<p style="font-size:16px;line-height:1.5;color:#1c1917">${paragraph.replaceAll("\n", "<br>")}</p>`)
    .join("");
  return `<div style="font-family:Georgia,serif;color:#1c1917">${body}<p style="font-size:14px;color:#1c1917">${htmlEscape(legal.platformName)} · ${htmlEscape(legal.mailingAddress)} · ${htmlEscape(legal.contactEmail)}</p></div>`;
}

export type AckFacts = {
  firstName: string;
  membershipName: string;
  teacherName: string;
  benefits: string;
  start: Date;
  amountChargedCents: number;
  taxCents: number;
  cardBrand: string;
  last4: string;
  termMonths: number;
  renewalPriceCents: number;
  nextRenewal: Date;
  introEndsAt: Date | null;
  policyText: string;
  policyUrl: string;
  cancelUrl: string;
};

export function acknowledgmentMail(facts: AckFacts, templates: RenewalTemplates, legal: LegalIdentity): MailCopy {
  const introLine = facts.introEndsAt
    ? `- Your intro period ends ${formatRenewalDate(facts.introEndsAt)}. Cancel before then to avoid being charged ${moneyLabel(facts.renewalPriceCents)}.`
    : "";
  const vars = {
    first_name: facts.firstName,
    membership_name: facts.membershipName,
    teacher_name: facts.teacherName,
    benefits_summary: facts.benefits,
    start_date: formatRenewalDate(facts.start),
    amount_charged: moneyLabel(facts.amountChargedCents),
    tax_amount: moneyLabel(facts.taxCents),
    card_brand: facts.cardBrand || "card",
    last4: facts.last4 || "••••",
    term_length: termLengthLabel(facts.termMonths),
    renewal_price: moneyLabel(facts.renewalPriceCents),
    next_renewal_date: formatRenewalDate(facts.nextRenewal),
    intro_line: introLine,
    minimum_commitment_or_none: "None",
    site_url: legal.siteUrl,
    teacher_policy_summary: facts.policyText || refundLine(facts.teacherName),
    teacher_policy_url: facts.policyUrl,
    cancel_url: facts.cancelUrl,
    terms_url: `${legal.siteUrl}/legal/terms`,
    privacy_url: `${legal.siteUrl}/legal/privacy`,
  };
  const subject = fillTemplate(templates.ackSubject, vars, legal);
  const text = fillTemplate(templates.ackBody, vars, legal);
  return { subject, text, html: mailHtml(text, legal) };
}

export function cancellationMail(input: {
  firstName: string;
  membershipName: string;
  teacherName: string;
  cancelDate: Date;
  termEnd: Date;
}, templates: RenewalTemplates, legal: LegalIdentity): MailCopy {
  const vars = {
    first_name: input.firstName,
    membership_name: input.membershipName,
    teacher_name: input.teacherName,
    cancel_date: formatRenewalDate(input.cancelDate),
    current_term_end_date: formatRenewalDate(input.termEnd),
  };
  const subject = fillTemplate(templates.cancelSubject, vars, legal);
  const text = fillTemplate(templates.cancelBody, vars, legal);
  return { subject, text, html: mailHtml(text, legal) };
}

export function cancellationScreen(membershipName: string, termEnd: Date, templates: RenewalTemplates, legal: LegalIdentity) {
  return fillTemplate(templates.cancelScreen, { membership_name: membershipName, current_term_end_date: formatRenewalDate(termEnd) }, legal);
}

export function confirmationSummary(termEnd: Date, templates: RenewalTemplates, legal: LegalIdentity) {
  return fillTemplate(templates.confirmSummary, { current_term_end_date: formatRenewalDate(termEnd) }, legal);
}

export type NoticeKind = "pre_renewal" | "intro_ending" | "price_change" | "material_change" | "annual";

export type NoticeDecision = {
  kind: NoticeKind;
  action: "send" | "wait" | "missed";
  eventAt: Date;
  daysBefore: number;
};

export type NoticePlanInput = {
  now: Date;
  termMonths: number;
  startedAt: Date;
  periodEnd: Date;
  introEndsAt: Date | null;
  introDays: number | null;
  priceChange: { effectiveAt: Date; sent: boolean } | null;
  materialChange: { effectiveAt: Date; sent: boolean } | null;
  annualSentFor: string[];
  preRenewalSent: boolean;
  introSent: boolean;
};

function windowDecision(kind: NoticeKind, now: Date, eventAt: Date, targetDays: number, minDays: number, maxDays: number, sent: boolean): NoticeDecision | null {
  if (sent) return null;
  const daysBefore = daysBetween(now, eventAt);
  if (daysBefore > maxDays) return { kind, action: "wait", eventAt, daysBefore };
  if (daysBefore < minDays) return { kind, action: "missed", eventAt, daysBefore };
  if (daysBefore <= targetDays) return { kind, action: "send", eventAt, daysBefore };
  return { kind, action: "wait", eventAt, daysBefore };
}

function nextAnniversary(startedAt: Date, now: Date) {
  for (let year = 1; year <= 20; year += 1) {
    const eventAt = addLocalMonths(startedAt, year * 12);
    const daysBefore = daysBetween(now, eventAt);
    if (daysBefore >= -NOTICE_WINDOWS.annualLateDays) return { eventAt, daysBefore, key: isoDate(eventAt) };
    if (daysBefore < -NOTICE_WINDOWS.annualLateDays && year === 20) return { eventAt, daysBefore, key: isoDate(eventAt) };
  }
  return null;
}

export function planNotices(input: NoticePlanInput): NoticeDecision[] {
  const decisions: NoticeDecision[] = [];
  if (input.termMonths >= 12) {
    const pre = windowDecision("pre_renewal", input.now, input.periodEnd, NOTICE_WINDOWS.preRenewal.targetDays, NOTICE_WINDOWS.preRenewal.minDays, NOTICE_WINDOWS.preRenewal.maxDays, input.preRenewalSent);
    if (pre) decisions.push(pre);
  } else {
    const anniversary = nextAnniversary(input.startedAt, input.now);
    if (anniversary && !input.annualSentFor.includes(anniversary.key)) {
      if (anniversary.daysBefore > 0) decisions.push({ kind: "annual", action: "wait", eventAt: anniversary.eventAt, daysBefore: anniversary.daysBefore });
      else if (anniversary.daysBefore >= -NOTICE_WINDOWS.annualLateDays) decisions.push({ kind: "annual", action: "send", eventAt: anniversary.eventAt, daysBefore: anniversary.daysBefore });
      else decisions.push({ kind: "annual", action: "missed", eventAt: anniversary.eventAt, daysBefore: anniversary.daysBefore });
    }
  }
  if (input.introEndsAt && input.introDays && input.introDays >= 7) {
    const window = input.introDays > 31 ? NOTICE_WINDOWS.introLong : NOTICE_WINDOWS.introShort;
    const intro = windowDecision("intro_ending", input.now, input.introEndsAt, window.targetDays, window.minDays, window.maxDays, input.introSent);
    if (intro) decisions.push(intro);
  }
  if (input.priceChange) {
    const price = windowDecision("price_change", input.now, input.priceChange.effectiveAt, NOTICE_WINDOWS.priceChange.targetDays, NOTICE_WINDOWS.priceChange.minDays, NOTICE_WINDOWS.priceChange.maxDays, input.priceChange.sent);
    if (price) decisions.push(price);
  }
  if (input.materialChange) {
    const material = windowDecision(
      "material_change",
      input.now,
      input.materialChange.effectiveAt,
      NOTICE_WINDOWS.materialChange.targetDays,
      NOTICE_WINDOWS.materialChange.minDays,
      NOTICE_WINDOWS.materialChange.maxDays,
      input.materialChange.sent,
    );
    if (material) decisions.push(material);
  }
  return decisions;
}

export function priceChangeDateError(now: Date, effectiveAt: Date, minDays = PRICE_CHANGE_MIN_DAYS_BACKEND) {
  const required = Math.max(PRICE_CHANGE_MIN_DAYS_BACKEND, minDays);
  if (daysBetween(now, effectiveAt) < required) return `The effective date must be at least ${required} days from today.`;
  return null;
}

const REQUIRED_NOTICE_KINDS = new Set<NoticeKind>(["pre_renewal", "intro_ending", "price_change", "material_change"]);

/** A missed annual reminder does not, by itself, stop the charge. */
export function missedRequiredNotice(kind: NoticeKind) {
  return REQUIRED_NOTICE_KINDS.has(kind);
}

export function priceAfterNotice(input: {
  lockedPriceCents: number;
  catalogPriceCents: number;
  change: { newPriceCents: number; effectiveAt: Date; noticeSentAt: Date | null } | null;
  renewsAt: Date;
  now?: Date;
}) {
  const locked = input.lockedPriceCents > 0 ? input.lockedPriceCents : input.catalogPriceCents;
  if (!input.change) return { priceCents: locked, blockedNewPrice: false, chargeRenewal: true };
  if (input.renewsAt.getTime() < input.change.effectiveAt.getTime()) return { priceCents: locked, blockedNewPrice: false, chargeRenewal: true };
  if (input.change.noticeSentAt) {
    const leadDays = daysBetween(input.change.noticeSentAt, input.change.effectiveAt);
    if (leadDays >= NOTICE_WINDOWS.priceChange.minDays && leadDays <= NOTICE_WINDOWS.priceChange.maxDays) {
      return { priceCents: input.change.newPriceCents, blockedNewPrice: false, chargeRenewal: true };
    }
    return { priceCents: locked, blockedNewPrice: true, chargeRenewal: false };
  }
  if (input.now && daysBetween(input.now, input.change.effectiveAt) >= NOTICE_WINDOWS.priceChange.minDays) {
    return { priceCents: locked, blockedNewPrice: true, chargeRenewal: true };
  }
  return { priceCents: locked, blockedNewPrice: true, chargeRenewal: false };
}

export function shouldRetryRenewal(input: { cancelAtPeriodEnd: boolean; status: string }) {
  if (input.cancelAtPeriodEnd) return false;
  if (input.status === "cancelled") return false;
  return true;
}

export function dunningBody(membershipName: string, cancelUrl: string) {
  return `The renewal charge for ${membershipName} did not go through. You can cancel anytime, and cancelling stops future charges: ${cancelUrl}`;
}

export function noticeAlert(kind: NoticeKind, reason: string, pause = false) {
  const base = `Renewal notice ${kind} was not sent in its legal window: ${reason}`;
  if (!pause) return base;
  return `${base} That renewal will not be charged.`;
}

export type NoticeMailFacts = {
  kind: NoticeKind;
  firstName: string;
  membershipName: string;
  teacherName: string;
  benefits: string;
  termMonths: number;
  renewalPriceCents: number;
  oldPriceCents: number;
  newPriceCents: number;
  cardBrand: string;
  last4: string;
  eventAt: Date;
  nextRenewal: Date;
  startedAt: Date;
  cancelUrl: string;
  changeSummary: string;
  priceStays: boolean;
};

export function noticeMail(facts: NoticeMailFacts, templates: RenewalTemplates, legal: LegalIdentity): MailCopy {
  const vars: Record<string, string> = {
    first_name: facts.firstName,
    membership_name: facts.membershipName,
    teacher_name: facts.teacherName,
    benefits_summary: facts.benefits,
    term_length: termLengthLabel(facts.termMonths),
    renewal_price: moneyLabel(facts.renewalPriceCents),
    old_price: moneyLabel(facts.oldPriceCents),
    new_price: moneyLabel(facts.newPriceCents),
    card_brand: facts.cardBrand || "card",
    last4: facts.last4 || "••••",
    renewal_date: formatRenewalDate(facts.eventAt),
    intro_end_date: formatRenewalDate(facts.eventAt),
    effective_date: formatRenewalDate(facts.eventAt),
    next_renewal_date: formatRenewalDate(facts.nextRenewal),
    start_date: formatRenewalDate(facts.startedAt),
    cancel_url: facts.cancelUrl,
    site_url: legal.siteUrl,
    refund_line: refundLine(facts.teacherName),
    change_summary: facts.changeSummary,
    price_phrase: facts.priceStays ? `stays ${moneyLabel(facts.renewalPriceCents)}` : `changes to ${moneyLabel(facts.newPriceCents)}`,
  };
  const subjectTemplate = {
    pre_renewal: templates.preRenewalSubject,
    intro_ending: templates.introSubject,
    price_change: templates.priceSubject,
    material_change: templates.materialSubject,
    annual: templates.annualSubject,
  }[facts.kind];
  const bodyTemplate = {
    pre_renewal: templates.preRenewalBody,
    intro_ending: templates.introBody,
    price_change: templates.priceBody,
    material_change: templates.materialBody,
    annual: templates.annualBody,
  }[facts.kind];
  const subject = fillTemplate(subjectTemplate, vars, legal);
  const text = fillTemplate(bodyTemplate, vars, legal);
  return { subject, text, html: mailHtml(text, legal) };
}
