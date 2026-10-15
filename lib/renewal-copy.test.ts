import { describe, expect, it } from "vitest";
import { emailCopy } from "@/lib/email-templates";
import { maySend } from "@/lib/messaging-rules";
import {
  BUILTIN_TEMPLATES,
  CONSENT_REQUIRED_ERROR,
  NOTICE_WINDOWS,
  PRICE_CHANGE_MIN_DAYS_BACKEND,
  PRICE_CHANGE_MIN_DAYS_TEACHER,
  acknowledgmentMail,
  acknowledgmentStillDue,
  buildDisclosure,
  consentAccepted,
  dunningBody,
  failedRenewalNotice,
  legalIdentity,
  materialPriceStays,
  membershipCheckoutPlan,
  membershipOffer,
  membershipStartedAt,
  membershipTermPhrase,
  noticeMail,
  noticeSendClaimed,
  planNotices,
  preservedAcknowledgment,
  priceAfterMemberNotice,
  priceAfterNotice,
  priceChangeDateError,
  priceNoticeSentAt,
  purchaseButtonLabel,
  relatedPriceChange,
  renewalNoticeEligible,
  replacementCard,
  savedCardDetails,
  shouldRetryRenewal,
} from "@/lib/renewal-copy";
import { textPdf } from "@/lib/renewal-pdf";

const legal = legalIdentity({
  platformName: "Northwind",
  companyLegalName: "Northwind LLC",
  mailingAddress: "1 Market, Los Angeles, CA",
  contactEmail: "hello@northwind.test",
  notificationsEmail: "notices@northwind.test",
  siteUrl: "https://northwind.test",
});

const noon = (iso: string) => new Date(`${iso}T12:00:00.000Z`);

function disclosure(priceCents = 12000) {
  return buildDisclosure({
    membershipName: "Monthly studio",
    teacherName: "Maya Alvarez Studio",
    teacherSlug: "maya-alvarez",
    membershipSlug: "monthly-studio",
    priceCents,
    renewalPriceCents: priceCents,
    termMonths: 1,
    now: noon("2026-10-09"),
    periodEnd: noon("2026-11-09"),
    intro: null,
    cardBrand: "card",
    last4: "••••",
    policyText: "Cancel anytime before the next renewal.",
  }, BUILTIN_TEMPLATES, legal);
}

describe("checkout disclosure and consent", () => {
  it("uses the statutory sentences and a charge-labeled button", () => {
    const view = disclosure();
    const text = view.canonical;
    expect(text).toContain("Auto-renewing membership: Monthly studio with Maya Alvarez Studio");
    expect(text).toContain("You'll be charged $120.00 today.");
    expect(text).toContain("automatically renews every 1 month");
    expect(text).toContain("card ending in ••••");
    expect(text).toContain("Account › Memberships › Cancel membership");
    expect(text).toContain("https://northwind.test/account/memberships");
    expect(text).toContain("No minimum commitment.");
    expect(text).toContain("Payments already made are not refunded");
    expect(text).not.toContain("full refund of the renewal charge");
    expect(view.checkbox.startsWith("I agree that my Monthly studio membership will automatically renew")).toBe(true);
    expect(view.buttonLabel).toBe("Start membership: $120.00 today");
    expect(view.version).toHaveLength(64);
  });

  it("puts a free intro ahead of the charge and changes the button", () => {
    const view = buildDisclosure({
      membershipName: "Monthly studio",
      teacherName: "Maya Alvarez Studio",
      teacherSlug: "maya-alvarez",
      membershipSlug: "monthly-studio",
      priceCents: 0,
      renewalPriceCents: 12000,
      termMonths: 1,
      now: noon("2026-10-09"),
      periodEnd: noon("2026-10-23"),
      intro: { days: 14, priceCents: 0 },
      cardBrand: "card",
      last4: "••••",
      policyText: "",
    }, BUILTIN_TEMPLATES, legal);
    expect(view.lines[0]?.segments.map((segment) => segment.text).join("")).toContain("Your 14-day intro is free.");
    expect(view.lines[0]?.bold).toBe(true);
    expect(view.buttonLabel).toBe("Start free intro, then $120.00/month");
    expect(purchaseButtonLabel({ todayCents: 2000, renewalCents: 12000, termMonths: 3, introFree: false })).toBe("Start membership: $20.00 today");
  });

  it("rejects a subscription unless the checkbox and the exact disclosure version match", () => {
    const view = disclosure();
    expect(consentAccepted({ recurring: true, consent: false, disclosureVersion: view.version, expectedVersion: view.version })).toEqual({ ok: false, error: CONSENT_REQUIRED_ERROR });
    expect(consentAccepted({ recurring: true, consent: true, disclosureVersion: "stale", expectedVersion: view.version }).ok).toBe(false);
    expect(consentAccepted({ recurring: true, consent: true, disclosureVersion: view.version, expectedVersion: view.version }).ok).toBe(true);
    expect(consentAccepted({ recurring: false, consent: false, disclosureVersion: "", expectedVersion: view.version }).ok).toBe(true);
    expect(disclosure(4000).version).not.toBe(view.version);
  });

  it("keeps the platform name configurable in the acknowledgment", () => {
    const mail = acknowledgmentMail({
      firstName: "Jules",
      membershipName: "Monthly studio",
      teacherName: "Maya Alvarez Studio",
      benefits: "4 classes per period",
      start: noon("2026-10-09"),
      amountChargedCents: 12000,
      taxCents: 0,
      cardBrand: "visa",
      last4: "4242",
      termMonths: 1,
      renewalPriceCents: 12000,
      nextRenewal: noon("2026-11-09"),
      introEndsAt: null,
      policyText: "Cancel anytime before the next renewal.",
      policyUrl: "https://northwind.test/t/maya-alvarez/m/monthly-studio",
      cancelUrl: "https://northwind.test/account/memberships/sub/cancel",
    }, BUILTIN_TEMPLATES, legal);
    expect(mail.subject).toBe("Your Monthly studio membership is active: renewal details and how to cancel");
    expect(mail.text).toContain("Northwind · Northwind LLC · 1 Market, Los Angeles, CA · hello@northwind.test");
    expect(mail.text).toContain("Cancel membership: https://northwind.test/account/memberships/sub/cancel");
    expect(mail.text).not.toContain("[PLATFORM NAME]");
    const pdf = textPdf(mail.subject, mail.text);
    expect(Buffer.from(pdf).subarray(0, 8).toString()).toBe("%PDF-1.4");
  });
});

describe("notice scheduler windows", () => {
  const base = {
    now: noon("2026-06-01"),
    termMonths: 12,
    startedAt: noon("2025-06-01"),
    periodEnd: noon("2026-07-01"),
    introEndsAt: null as Date | null,
    introDays: null as number | null,
    priceChange: null,
    materialChange: null,
    annualSentFor: [] as string[],
    preRenewalSent: false,
    introSent: false,
  };

  it("sends a 12-month pre-renewal inside 15 to 45 days and misses it after that", () => {
    const onTime = planNotices({ ...base, periodEnd: new Date(base.now.getTime() + 30 * 86_400_000) });
    expect(onTime.find((item) => item.kind === "pre_renewal")?.action).toBe("send");
    expect(onTime.some((item) => item.kind === "annual")).toBe(false);
    const early = planNotices({ ...base, periodEnd: new Date(base.now.getTime() + 50 * 86_400_000) });
    expect(early.find((item) => item.kind === "pre_renewal")?.action).toBe("wait");
    const late = planNotices({ ...base, periodEnd: new Date(base.now.getTime() + 10 * 86_400_000) });
    expect(late.find((item) => item.kind === "pre_renewal")?.action).toBe("missed");
  });

  it("uses a 7-day target for long intros and a 3-day target for shorter ones", () => {
    const longIntro = planNotices({
      ...base,
      termMonths: 1,
      introDays: 40,
      introEndsAt: new Date(base.now.getTime() + 7 * 86_400_000),
    });
    expect(longIntro.find((item) => item.kind === "intro_ending")?.action).toBe("send");
    const shortWait = planNotices({
      ...base,
      termMonths: 1,
      introDays: 14,
      introEndsAt: new Date(base.now.getTime() + 10 * 86_400_000),
    });
    expect(shortWait.find((item) => item.kind === "intro_ending")?.action).toBe("wait");
    const shortSend = planNotices({
      ...base,
      termMonths: 1,
      introDays: 14,
      introEndsAt: new Date(base.now.getTime() + 3 * 86_400_000),
    });
    expect(shortSend.find((item) => item.kind === "intro_ending")?.action).toBe("send");
    const tooLate = planNotices({
      ...base,
      termMonths: 1,
      introDays: 14,
      introEndsAt: new Date(base.now.getTime() + 2 * 86_400_000),
    });
    expect(tooLate.find((item) => item.kind === "intro_ending")?.action).toBe("missed");
    const hourAfterTarget = planNotices({
      ...base,
      termMonths: 1,
      introDays: 14,
      introEndsAt: new Date(base.now.getTime() + 3 * 86_400_000 + 3_600_000),
    });
    expect(hourAfterTarget.find((item) => item.kind === "intro_ending")?.action).toBe("send");
    expect(NOTICE_WINDOWS.introShort.targetDays).toBeGreaterThan(NOTICE_WINDOWS.introShort.minDays);
  });

  it("sends the annual reminder for monthly plans and the price notice only inside 7 to 30 days", () => {
    const annual = planNotices({ ...base, termMonths: 1, startedAt: noon("2025-06-01"), now: noon("2026-06-02") });
    expect(annual.find((item) => item.kind === "annual")?.action).toBe("send");
    const price = planNotices({
      ...base,
      termMonths: 1,
      priceChange: { effectiveAt: new Date(base.now.getTime() + 21 * 86_400_000), sent: false },
    });
    expect(price.find((item) => item.kind === "price_change")?.action).toBe("send");
    const missedPrice = planNotices({
      ...base,
      termMonths: 1,
      priceChange: { effectiveAt: new Date(base.now.getTime() + 5 * 86_400_000), sent: false },
    });
    expect(missedPrice.find((item) => item.kind === "price_change")?.action).toBe("missed");
    const material = planNotices({
      ...base,
      materialChange: { effectiveAt: new Date(base.now.getTime() + 33 * 86_400_000), sent: false },
    });
    expect(material.find((item) => item.kind === "material_change")?.action).toBe("send");
    const materialEarly = planNotices({
      ...base,
      materialChange: { effectiveAt: new Date(base.now.getTime() + 40 * 86_400_000), sent: false },
    });
    expect(materialEarly.find((item) => item.kind === "material_change")?.action).toBe("wait");
    const materialLate = planNotices({
      ...base,
      materialChange: { effectiveAt: new Date(base.now.getTime() + 29 * 86_400_000), sent: false },
    });
    expect(materialLate.find((item) => item.kind === "material_change")?.action).toBe("missed");
    expect(NOTICE_WINDOWS.materialChange.targetDays).toBeGreaterThan(NOTICE_WINDOWS.materialChange.minDays);
    expect(NOTICE_WINDOWS.materialChange.minDays).toBeGreaterThanOrEqual(30);
  });

  it("keeps the annual reminder on the original start after a renewal moves the period", () => {
    const createdAt = noon("2025-06-01");
    const currentPeriodStart = noon("2026-05-01");
    const now = noon("2026-06-02");
    const startedAt = membershipStartedAt({ createdAt, currentPeriodStart });
    expect(startedAt).toEqual(createdAt);
    const anchored = planNotices({ ...base, termMonths: 1, startedAt, now });
    expect(anchored.find((item) => item.kind === "annual")?.action).toBe("send");
    const slid = planNotices({ ...base, termMonths: 1, startedAt: currentPeriodStart, now });
    expect(slid.find((item) => item.kind === "annual")?.action).toBe("wait");
  });

  it("keeps the old price when the notice was not delivered in the window", () => {
    const renewsAt = noon("2026-08-01");
    const effectiveAt = noon("2026-08-01");
    expect(priceAfterNotice({
      lockedPriceCents: 12000,
      catalogPriceCents: 14000,
      change: { newPriceCents: 14000, effectiveAt, noticeSentAt: noon("2026-07-11") },
      renewsAt,
    })).toEqual({ priceCents: 14000, blockedNewPrice: false });
    expect(priceAfterNotice({
      lockedPriceCents: 12000,
      catalogPriceCents: 14000,
      change: { newPriceCents: 14000, effectiveAt, noticeSentAt: noon("2026-07-28") },
      renewsAt,
    })).toEqual({ priceCents: 12000, blockedNewPrice: true });
    expect(priceAfterNotice({
      lockedPriceCents: 12000,
      catalogPriceCents: 14000,
      change: { newPriceCents: 14000, effectiveAt, noticeSentAt: null },
      renewsAt,
    })).toEqual({ priceCents: 12000, blockedNewPrice: true });
    expect(priceAfterNotice({
      lockedPriceCents: 12000,
      catalogPriceCents: 14000,
      change: { newPriceCents: 14000, effectiveAt, noticeSentAt: noon("2026-07-11") },
      renewsAt: noon("2026-07-15"),
    }).priceCents).toBe(12000);
  });

  it("keeps the old price for a member whose own notice failed even if another member was notified", () => {
    const effectiveAt = noon("2026-08-01");
    const renewsAt = noon("2026-08-01");
    const noticed = noon("2026-07-11");
    expect(priceNoticeSentAt([
      { kind: "price_change", eventOn: "2026-08-01", status: "failed", sentAt: noticed },
    ], effectiveAt)).toBeNull();
    expect(priceNoticeSentAt([
      { kind: "price_change", eventOn: "2026-08-01", status: "missed", sentAt: null },
    ], effectiveAt)).toBeNull();
    expect(priceNoticeSentAt([
      { kind: "price_change", eventOn: "2026-08-01", status: "sent", sentAt: noticed },
    ], effectiveAt)).toEqual(noticed);
    const unlocked = priceAfterMemberNotice({
      lockedPriceCents: 12000,
      catalogPriceCents: 14000,
      change: { newPriceCents: 14000, effectiveAt },
      memberNoticeSentAt: noticed,
      renewsAt,
    });
    const blocked = priceAfterMemberNotice({
      lockedPriceCents: 12000,
      catalogPriceCents: 14000,
      change: { newPriceCents: 14000, effectiveAt },
      memberNoticeSentAt: null,
      renewsAt,
    });
    expect(unlocked).toEqual({ priceCents: 14000, blockedNewPrice: false });
    expect(blocked).toEqual({ priceCents: 12000, blockedNewPrice: true });
  });

  it("blocks teacher price dates under 14 days and any date under 8 days", () => {
    const now = noon("2026-10-09");
    expect(priceChangeDateError(now, noon("2026-10-19"), PRICE_CHANGE_MIN_DAYS_TEACHER)).toMatch(/14 days/);
    expect(priceChangeDateError(now, noon("2026-10-19"), PRICE_CHANGE_MIN_DAYS_BACKEND)).toBeNull();
    expect(priceChangeDateError(now, noon("2026-10-14"))).toMatch(/8 days/);
    expect(priceChangeDateError(now, noon("2026-11-20"), 30)).toBeNull();
  });
});

describe("cancellation and dunning", () => {
  it("does not retry a charge after cancellation and tells the member how to cancel", () => {
    expect(shouldRetryRenewal({ cancelAtPeriodEnd: true, status: "past_due" })).toBe(false);
    expect(shouldRetryRenewal({ cancelAtPeriodEnd: false, status: "cancelled" })).toBe(false);
    expect(shouldRetryRenewal({ cancelAtPeriodEnd: false, status: "past_due" })).toBe(true);
    const body = dunningBody("Monthly studio", "https://northwind.test/account/memberships/sub/cancel");
    expect(body).toContain("https://northwind.test/account/memberships/sub/cancel");
    expect(body.toLowerCase()).not.toContain("cannot cancel");
    const notice = failedRenewalNotice({ subscriptionId: "sub", membershipName: "Monthly studio", origin: "https://northwind.test/" });
    expect(notice.href).toBe("/account/memberships/sub/payment");
    expect(notice.href).not.toContain("cancel");
    expect(notice.body).toContain(notice.cancelUrl);
    const copy = emailCopy("membership.payment_failed", { name: "Ada", title: notice.membershipName, body: notice.body, href: notice.href });
    expect(copy.cta).toBe("Update payment");
    expect(copy.text).toContain(notice.body);
    expect(copy.text).toContain("Update payment: /account/memberships/sub/payment");
    expect(copy.text).not.toContain("Update payment: /account/memberships/sub/cancel");
  });

  it("sends membership mail even when marketing is unsubscribed", () => {
    const input = { channel: "email" as const, consent: "transactional" as const, emailUnsubscribed: true, emailSuppressed: false, marketingOptIn: false, smsOptIn: false, smsSuppressed: false };
    expect(maySend({ ...input, event: "membership.acknowledgment" })).toBe(true);
    expect(maySend({ ...input, event: "membership.payment_failed" })).toBe(true);
    expect(maySend({ ...input, event: "winback" })).toBe(false);
    expect(maySend({ ...input, event: "membership.acknowledgment", emailSuppressed: true })).toBe(false);
  });

  it("charges nothing today for a free intro and the renewal price afterwards", () => {
    const offer = membershipOffer({ priceCents: 12000, termMonths: 1, recurring: true, introDays: 14, introPriceCents: 0, now: noon("2026-10-09") });
    expect(offer.todayCents).toBe(0);
    expect(offer.renewalCents).toBe(12000);
    expect(offer.chargeLater).toBe(true);
    expect(offer.trialDays).toBe(14);
    const regular = membershipOffer({ priceCents: 12000, termMonths: 1, recurring: true, introDays: null, introPriceCents: null, now: noon("2026-10-09") });
    expect(regular.todayCents).toBe(12000);
    expect(regular.chargeLater).toBe(false);
  });

  it("collects a card when a recurring plan is $0 today and renews later", () => {
    const now = noon("2026-10-09");
    const promo = membershipCheckoutPlan({
      recurring: true,
      renewalCents: 12000,
      dueTodayCents: 0,
      intro: false,
      introTrialDays: 0,
      now,
      periodEnd: noon("2026-11-09"),
      stripeReady: true,
    });
    expect(promo.collectCard).toBe(true);
    expect(promo.status).toBe("pending");
    expect(promo.checkoutCents).toBe(12000);
    expect(promo.trialDays).toBeGreaterThan(27);
    const discountedIntro = membershipCheckoutPlan({
      recurring: true,
      renewalCents: 12000,
      dueTodayCents: 0,
      intro: true,
      introTrialDays: 14,
      now,
      periodEnd: noon("2026-10-23"),
      stripeReady: true,
    });
    expect(discountedIntro).toMatchObject({ collectCard: true, status: "pending", checkoutCents: 12000, trialDays: 14 });
    const oneTime = membershipCheckoutPlan({
      recurring: false,
      renewalCents: 12000,
      dueTodayCents: 0,
      intro: false,
      introTrialDays: 0,
      now,
      periodEnd: noon("2026-11-09"),
      stripeReady: true,
    });
    expect(oneTime).toMatchObject({ collectCard: false, status: "paid" });
    const paid = membershipCheckoutPlan({
      recurring: true,
      renewalCents: 12000,
      dueTodayCents: 12000,
      intro: false,
      introTrialDays: 0,
      now,
      periodEnd: noon("2026-11-09"),
      stripeReady: true,
    });
    expect(paid).toMatchObject({ collectCard: false, status: "pending", checkoutCents: 12000, trialDays: 0 });
  });

  it("retries a failed acknowledgment and skips one-time plans", () => {
    expect(acknowledgmentStillDue({ recurring: false, deliveryStatus: null })).toBe(false);
    expect(acknowledgmentStillDue({ recurring: true, deliveryStatus: "failed" })).toBe(true);
    expect(acknowledgmentStillDue({ recurring: true, deliveryStatus: "pending" })).toBe(true);
    expect(acknowledgmentStillDue({ recurring: true, deliveryStatus: "sent" })).toBe(false);
  });

  it("downloads the stored acknowledgment instead of the current template", () => {
    const stored = preservedAcknowledgment({
      storedEmail: { subject: "Original terms", text: "Keep this email. Renewal is $12.00." },
      disclosureText: "Accepted disclosure at $12.00.",
      regenerated: { subject: "Updated terms", text: "Renewal is $14.00." },
    });
    expect(stored).toEqual({ subject: "Original terms", text: "Keep this email. Renewal is $12.00.", verbatim: true });
    const disclosure = preservedAcknowledgment({
      storedEmail: null,
      disclosureText: "Accepted disclosure at $12.00.",
      regenerated: { subject: "Updated terms", text: "Renewal is $14.00." },
    });
    expect(disclosure.text).toBe("Accepted disclosure at $12.00.");
    expect(disclosure.text).not.toContain("$14.00");
  });

  it("saves a real card and ignores the checkout placeholder", () => {
    expect(savedCardDetails({ brand: "visa", last4: "4242" })).toEqual({ cardBrand: "visa", cardLast4: "4242" });
    expect(savedCardDetails({ brand: "card", last4: "••••" })).toBeNull();
    expect(savedCardDetails({ brand: "visa", last4: "••••" })).toBeNull();
    expect(savedCardDetails(null)).toBeNull();
  });

  it("sends renewal notices only for live recurring memberships", () => {
    expect(renewalNoticeEligible({ status: "active", cancelAtPeriodEnd: false, recurring: true })).toBe(true);
    expect(renewalNoticeEligible({ status: "past_due", cancelAtPeriodEnd: false, recurring: true })).toBe(true);
    expect(renewalNoticeEligible({ status: "pending", cancelAtPeriodEnd: false, recurring: true })).toBe(false);
    expect(renewalNoticeEligible({ status: "active", cancelAtPeriodEnd: false, recurring: false })).toBe(false);
    expect(renewalNoticeEligible({ status: "active", cancelAtPeriodEnd: true, recurring: true })).toBe(false);
    expect(renewalNoticeEligible({ status: "cancelled", cancelAtPeriodEnd: false, recurring: true })).toBe(false);
    const end = noon("2026-11-09");
    expect(membershipTermPhrase({ recurring: true, status: "active", cancelAtPeriodEnd: false, periodEnd: end })).toBe("Renews November 9, 2026");
    expect(membershipTermPhrase({ recurring: false, status: "active", cancelAtPeriodEnd: false, periodEnd: end })).toBe("Ends November 9, 2026");
    expect(membershipTermPhrase({ recurring: true, status: "pending", cancelAtPeriodEnd: false, periodEnd: end })).toBe("Payment pending");
    expect(membershipTermPhrase({ recurring: true, status: "active", cancelAtPeriodEnd: true, periodEnd: end })).toBe("Ends November 9, 2026");
  });

  it("keeps an unrelated price off a material-change notice", () => {
    const older = { effectiveAt: noon("2026-06-01"), oldPriceCents: 10000, newPriceCents: 15000 };
    const sameDay = { effectiveAt: noon("2026-12-01"), oldPriceCents: 12000, newPriceCents: 15000 };
    const eventAt = noon("2026-12-01");
    expect(relatedPriceChange({ kind: "material_change", eventAt, price: older })).toBeNull();
    expect(materialPriceStays("material_change", null)).toBe(true);
    expect(relatedPriceChange({ kind: "material_change", eventAt, price: sameDay })).toEqual(sameDay);
    expect(materialPriceStays("material_change", sameDay)).toBe(false);
    const facts = {
      kind: "material_change" as const,
      firstName: "Lila",
      membershipName: "Monthly studio",
      teacherName: "Maya Alvarez Studio",
      benefits: "Weekly class",
      termMonths: 1,
      renewalPriceCents: 12000,
      oldPriceCents: 12000,
      newPriceCents: 15000,
      cardBrand: "visa",
      last4: "4242",
      eventAt,
      nextRenewal: eventAt,
      startedAt: noon("2025-12-01"),
      cancelUrl: "https://northwind.test/account/memberships/sub/cancel",
      changeSummary: "Class moves to Tuesday",
    };
    expect(noticeMail({ ...facts, priceStays: true }, BUILTIN_TEMPLATES, legal).text).toContain("Your price stays $120.00");
    expect(noticeMail({ ...facts, priceStays: true }, BUILTIN_TEMPLATES, legal).text).not.toContain("changes to $150.00");
    expect(noticeMail({ ...facts, priceStays: false }, BUILTIN_TEMPLATES, legal).text).toContain("Your price changes to $150.00");
  });

  it("sends a renewal notice only from the tick that claimed the row", () => {
    expect(noticeSendClaimed(1)).toBe(true);
    expect(noticeSendClaimed(0)).toBe(false);
  });

  it("replaces a stored card when Stripe has a different one", () => {
    expect(replacementCard({ cardBrand: "card", cardLast4: "••••" }, { cardBrand: "visa", cardLast4: "4242" })).toEqual({ cardBrand: "visa", cardLast4: "4242" });
    expect(replacementCard({ cardBrand: "visa", cardLast4: "4242" }, { cardBrand: "mastercard", cardLast4: "4444" })).toEqual({ cardBrand: "mastercard", cardLast4: "4444" });
    expect(replacementCard({ cardBrand: "visa", cardLast4: "4242" }, { cardBrand: "visa", cardLast4: "4242" })).toBeNull();
    expect(replacementCard({ cardBrand: "visa", cardLast4: "4242" }, null)).toBeNull();
  });
});
