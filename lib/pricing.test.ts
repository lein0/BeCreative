import { describe, expect, it } from "vitest";
import {
  canSpendMembership,
  canSpendPack,
  firstClassFreeEligible,
  checkoutPromoCode,
  normalizeCodes,
  promoCookieFromLink,
  quotePrice,
  shouldRestoreEntitlement,
  validatePromo,
  type PromoRule,
} from "@/lib/pricing";

const promo = (overrides: Partial<PromoRule> = {}): PromoRule => ({
  code: "BECREATIVE15",
  active: true,
  discountType: "percent",
  percentOffBps: 1500,
  amountOffCents: 0,
  startsAt: null,
  endsAt: null,
  maxRedemptions: 100,
  maxPerCustomer: 1,
  firstTimeOnly: false,
  minPurchaseCents: 0,
  funding: "platform",
  platformSharePercent: 100,
  appliesTo: "all",
  teacherId: null,
  classIds: [],
  categoryIds: [],
  packIds: [],
  membershipIds: [],
  cities: [],
  ...overrides,
});

const product = { kind: "class" as const, teacherId: "t1", classId: "c1", categoryId: "acting", city: "Los Angeles" };

describe("discount math and funding", () => {
  it("lets a platform-funded code keep the teacher whole", () => {
    const quote = quotePrice({ listPriceCents: 10_000, feePercent: 10, feeFixedCents: 0, promo: promo() });
    expect(quote.discountCents).toBe(1500);
    expect(quote.studentPaysCents).toBe(8500);
    expect(quote.teacherAmountCents).toBe(9000);
    expect(quote.platformFeeCents).toBe(0);
    expect(quote.platformLiabilityCents).toBe(500);
    expect(quote.platformFundedCents).toBe(1500);
  });

  it("takes a teacher-funded discount out of the teacher payout", () => {
    const quote = quotePrice({
      listPriceCents: 10_000,
      feePercent: 10,
      feeFixedCents: 0,
      promo: promo({ funding: "teacher", platformSharePercent: 0, code: "MAYA15" }),
    });
    expect(quote.studentPaysCents).toBe(8500);
    expect(quote.teacherAmountCents).toBe(7500);
    expect(quote.platformFeeCents).toBe(1000);
    expect(quote.teacherFundedCents).toBe(1500);
    expect(quote.platformLiabilityCents).toBe(0);
  });

  it("splits a discount and ignores codes on free or credited checkouts", () => {
    const split = quotePrice({
      listPriceCents: 10_000,
      feePercent: 10,
      feeFixedCents: 0,
      promo: promo({ funding: "split", platformSharePercent: 50 }),
    });
    expect(split.platformFundedCents).toBe(750);
    expect(split.teacherFundedCents).toBe(750);
    expect(split.teacherAmountCents).toBe(8250);
    expect(split.studentPaysCents).toBe(8500);

    const free = quotePrice({ listPriceCents: 0, feePercent: 10, feeFixedCents: 0, promo: promo() });
    expect(free.paymentPath).toBe("free");
    expect(free.codeApplied).toBeNull();
    const credit = quotePrice({ listPriceCents: 4000, feePercent: 10, feeFixedCents: 0, entitlement: true, promo: promo() });
    expect(credit.studentPaysCents).toBe(0);
    expect(credit.paymentPath).toBe("entitlement");
  });
});

describe("promo limits and first class free", () => {
  const now = new Date("2026-10-07T18:00:00Z");

  it("enforces redemption limits, first-time, minimum, and one code per order", () => {
    expect(validatePromo({ promo: promo(), now, listPriceCents: 4000, totalRedemptions: 100, customerRedemptions: 0, isFirstTimeStudent: true, product }).ok).toBe(false);
    expect(validatePromo({ promo: promo(), now, listPriceCents: 4000, totalRedemptions: 1, customerRedemptions: 1, isFirstTimeStudent: true, product }).ok).toBe(false);
    expect(validatePromo({ promo: promo({ firstTimeOnly: true }), now, listPriceCents: 4000, totalRedemptions: 0, customerRedemptions: 0, isFirstTimeStudent: false, product }).ok).toBe(false);
    expect(validatePromo({ promo: promo({ minPurchaseCents: 5000 }), now, listPriceCents: 4000, totalRedemptions: 0, customerRedemptions: 0, isFirstTimeStudent: true, product }).ok).toBe(false);
    expect(validatePromo({ promo: promo({ classIds: ["other"] }), now, listPriceCents: 4000, totalRedemptions: 0, customerRedemptions: 0, isFirstTimeStudent: true, product }).ok).toBe(false);
    expect(validatePromo({
      promo: promo({ classIds: ["scene-study"] }),
      now,
      listPriceCents: 4000,
      totalRedemptions: 0,
      customerRedemptions: 0,
      isFirstTimeStudent: true,
      product: { kind: "class", teacherId: "t1", categoryId: "acting", city: "Los Angeles" },
    }).ok).toBe(false);
    expect(normalizeCodes(["maya15", " SAVE10 "])).toEqual({ code: null, error: "Only one promo code can be used per order." });
    expect(normalizeCodes([" becreative15 "]).code).toBe("BECREATIVE15");
    expect(checkoutPromoCode("form20", "cookie10")).toEqual({ code: "FORM20", error: null });
    expect(checkoutPromoCode("  ", "cookie10")).toEqual({ code: "COOKIE10", error: null });
    expect(checkoutPromoCode("", "")).toEqual({ code: null, error: null });
    expect(promoCookieFromLink("save10")).toBe("SAVE10");
    expect(promoCookieFromLink("newcode")).toBe("NEWCODE");
    expect(promoCookieFromLink("  ")).toBeNull();
  });

  it("allows one intro class per student per teacher and restores credits before start", () => {
    expect(firstClassFreeEligible({ enabled: true, alreadyRedeemed: false, listPriceCents: 4500 })).toBe(true);
    expect(firstClassFreeEligible({ enabled: true, alreadyRedeemed: true, listPriceCents: 4500 })).toBe(false);
    expect(firstClassFreeEligible({ enabled: true, alreadyRedeemed: false, listPriceCents: 0 })).toBe(false);
    const quote = quotePrice({ listPriceCents: 4500, feePercent: 10, feeFixedCents: 0, firstClassFree: true, promo: promo() });
    expect(quote.studentPaysCents).toBe(0);
    expect(quote.paymentPath).toBe("first_class_free");
    expect(canSpendPack({ creditsRemaining: 1, expiresAt: new Date("2026-12-01"), now, covers: true }).ok).toBe(true);
    expect(canSpendPack({ creditsRemaining: 0, expiresAt: null, now, covers: true }).ok).toBe(false);
    expect(canSpendMembership({ status: "active", periodEnd: new Date("2026-11-07"), now, unlimited: false, classesPerPeriod: 4, classesUsed: 4, covers: true }).ok).toBe(false);
    const start = new Date("2026-10-20T02:00:00Z");
    expect(shouldRestoreEntitlement(start, new Date("2026-10-19T00:00:00Z"))).toBe(true);
    expect(shouldRestoreEntitlement(start, new Date("2026-10-20T03:00:00Z"))).toBe(false);
  });
});
