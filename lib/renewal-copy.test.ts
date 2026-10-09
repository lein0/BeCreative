import { describe, expect, it } from "vitest";
import { maySend } from "@/lib/messaging-rules";
import {
  BUILTIN_TEMPLATES,
  CONSENT_REQUIRED_ERROR,
  PRICE_CHANGE_MIN_DAYS_BACKEND,
  PRICE_CHANGE_MIN_DAYS_TEACHER,
  acknowledgmentMail,
  buildDisclosure,
  consentAccepted,
  dunningBody,
  legalIdentity,
  membershipOffer,
  planNotices,
  missedRequiredNotice,
  noticeAlert,
  priceAfterNotice,
  priceChangeDateError,
  purchaseButtonLabel,
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
    expect(text).toContain("If a required renewal notice is not sent in its window, that renewal is not charged.");
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
    expect(mail.text).toContain("If a required renewal notice is not sent in its window, that renewal is not charged.");
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
  });

  it("does not charge a renewal when the price notice missed its window", () => {
    const renewsAt = noon("2026-08-01");
    const effectiveAt = noon("2026-08-01");
    expect(priceAfterNotice({
      lockedPriceCents: 12000,
      catalogPriceCents: 14000,
      change: { newPriceCents: 14000, effectiveAt, noticeSentAt: noon("2026-07-11") },
      renewsAt,
    })).toEqual({ priceCents: 14000, blockedNewPrice: false, chargeRenewal: true });
    expect(priceAfterNotice({
      lockedPriceCents: 12000,
      catalogPriceCents: 14000,
      change: { newPriceCents: 14000, effectiveAt, noticeSentAt: noon("2026-07-28") },
      renewsAt,
      now: noon("2026-07-28"),
    })).toEqual({ priceCents: 12000, blockedNewPrice: true, chargeRenewal: false });
    expect(priceAfterNotice({
      lockedPriceCents: 12000,
      catalogPriceCents: 14000,
      change: { newPriceCents: 14000, effectiveAt, noticeSentAt: null },
      renewsAt,
      now: noon("2026-07-28"),
    })).toEqual({ priceCents: 12000, blockedNewPrice: true, chargeRenewal: false });
    expect(priceAfterNotice({
      lockedPriceCents: 12000,
      catalogPriceCents: 14000,
      change: { newPriceCents: 14000, effectiveAt, noticeSentAt: null },
      renewsAt,
      now: noon("2026-07-01"),
    }).chargeRenewal).toBe(true);
    const before = priceAfterNotice({
      lockedPriceCents: 12000,
      catalogPriceCents: 14000,
      change: { newPriceCents: 14000, effectiveAt, noticeSentAt: noon("2026-07-11") },
      renewsAt: noon("2026-07-15"),
    });
    expect(before.priceCents).toBe(12000);
    expect(before.chargeRenewal).toBe(true);
    expect(missedRequiredNotice("pre_renewal")).toBe(true);
    expect(missedRequiredNotice("intro_ending")).toBe(true);
    expect(missedRequiredNotice("material_change")).toBe(true);
    expect(missedRequiredNotice("annual")).toBe(false);
    expect(noticeAlert("price_change", "subscription sub", true)).toContain("will not be charged");
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
});
