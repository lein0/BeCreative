export type Funding = "platform" | "teacher" | "split";

export type PromoRule = {
  code: string;
  active: boolean;
  discountType: "percent" | "fixed";
  percentOffBps: number;
  amountOffCents: number;
  startsAt: Date | null;
  endsAt: Date | null;
  maxRedemptions: number | null;
  maxPerCustomer: number | null;
  firstTimeOnly: boolean;
  minPurchaseCents: number;
  funding: Funding;
  platformSharePercent: number;
  appliesTo: "all" | "classes" | "packs" | "memberships";
  teacherId: string | null;
  classIds: string[];
  categoryIds: string[];
  packIds: string[];
  membershipIds: string[];
  cities: string[];
};

export type ProductScope = {
  kind: "class" | "pack" | "membership";
  teacherId: string | null;
  classId?: string;
  categoryId?: string;
  packId?: string;
  membershipId?: string;
  city?: string | null;
};

export function normalFee(amountCents: number, feePercent: number, feeFixedCents: number): number {
  if (amountCents <= 0) return 0;
  const percentFee = Math.round(amountCents * (feePercent / 100));
  return Math.min(amountCents, Math.max(0, percentFee + feeFixedCents));
}

export function discountAmount(listPriceCents: number, promo: Pick<PromoRule, "discountType" | "percentOffBps" | "amountOffCents">): number {
  if (listPriceCents <= 0) return 0;
  const raw = promo.discountType === "percent" ? Math.round((listPriceCents * promo.percentOffBps) / 10_000) : promo.amountOffCents;
  return Math.min(listPriceCents, Math.max(0, raw));
}

export type PriceQuote = {
  listPriceCents: number;
  discountCents: number;
  studentPaysCents: number;
  platformFeeCents: number;
  teacherAmountCents: number;
  platformFundedCents: number;
  teacherFundedCents: number;
  platformLiabilityCents: number;
  codeApplied: string | null;
  codeError: string | null;
  paymentPath: "cash" | "entitlement" | "first_class_free" | "free";
};

export function quotePrice(input: {
  listPriceCents: number;
  feePercent: number;
  feeFixedCents: number;
  promo?: PromoRule | null;
  promoError?: string | null;
  entitlement?: boolean;
  firstClassFree?: boolean;
}): PriceQuote {
  const list = Math.max(0, input.listPriceCents);
  const empty = {
    listPriceCents: list,
    discountCents: 0,
    studentPaysCents: 0,
    platformFeeCents: 0,
    teacherAmountCents: 0,
    platformFundedCents: 0,
    teacherFundedCents: 0,
    platformLiabilityCents: 0,
    codeApplied: null as string | null,
    codeError: null as string | null,
  };
  if (input.entitlement) return { ...empty, paymentPath: "entitlement" };
  if (input.firstClassFree && list > 0) {
    return { ...empty, paymentPath: "first_class_free", codeError: input.promo ? "Codes don't apply to a free intro class." : null };
  }
  if (list === 0) {
    return { ...empty, paymentPath: "free", codeError: input.promo ? "Codes don't apply to free classes." : null };
  }
  if (input.promoError) {
    const fee = normalFee(list, input.feePercent, input.feeFixedCents);
    return {
      ...empty,
      studentPaysCents: list,
      platformFeeCents: fee,
      teacherAmountCents: list - fee,
      paymentPath: "cash",
      codeError: input.promoError,
    };
  }
  if (!input.promo) {
    const fee = normalFee(list, input.feePercent, input.feeFixedCents);
    return { ...empty, studentPaysCents: list, platformFeeCents: fee, teacherAmountCents: list - fee, paymentPath: "cash" };
  }
  const discount = discountAmount(list, input.promo);
  const studentPays = list - discount;
  const teacherBaseline = list - normalFee(list, input.feePercent, input.feeFixedCents);
  const share = input.promo.funding === "platform" ? 100 : input.promo.funding === "teacher" ? 0 : clamp(input.promo.platformSharePercent, 0, 100);
  const platformFunded = Math.round((discount * share) / 100);
  const teacherFunded = discount - platformFunded;
  const teacherAmount = Math.max(0, teacherBaseline - teacherFunded);
  const platformNet = studentPays - teacherAmount;
  return {
    listPriceCents: list,
    discountCents: discount,
    studentPaysCents: studentPays,
    platformFeeCents: Math.max(0, platformNet),
    teacherAmountCents: teacherAmount,
    platformFundedCents: platformFunded,
    teacherFundedCents: teacherFunded,
    platformLiabilityCents: Math.max(0, -platformNet),
    codeApplied: input.promo.code,
    codeError: null,
    paymentPath: "cash",
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeCodes(codes: string[]): { code: string | null; error: string | null } {
  const unique = [...new Set(codes.map((code) => code.trim().toUpperCase()).filter(Boolean))];
  if (unique.length > 1) return { code: null, error: "Only one promo code can be used per order." };
  return { code: unique[0] ?? null, error: null };
}

export function checkoutPromoCode(formCode: string | null | undefined, cookieCode: string | null | undefined) {
  const submitted = formCode?.trim() ?? "";
  if (submitted) return normalizeCodes([submitted]);
  return normalizeCodes([cookieCode ?? ""]);
}

export function promoCookieFromLink(queryCode: string | null | undefined) {
  const next = queryCode?.trim() ?? "";
  if (!next) return null;
  return next.toUpperCase();
}

export function validatePromo(input: {
  promo: PromoRule;
  now: Date;
  listPriceCents: number;
  totalRedemptions: number;
  customerRedemptions: number;
  isFirstTimeStudent: boolean;
  product: ProductScope;
}): { ok: true } | { ok: false; reason: string } {
  const { promo, product } = input;
  if (!promo.active) return { ok: false, reason: "This code is no longer active." };
  if (promo.startsAt && input.now < promo.startsAt) return { ok: false, reason: "This code isn't active yet." };
  if (promo.endsAt && input.now > promo.endsAt) return { ok: false, reason: "This code has expired." };
  if (input.listPriceCents <= 0) return { ok: false, reason: "Codes don't apply to free classes." };
  if (input.listPriceCents < promo.minPurchaseCents) return { ok: false, reason: "This order doesn't meet the minimum for that code." };
  if (promo.maxRedemptions != null && input.totalRedemptions >= promo.maxRedemptions) return { ok: false, reason: "This code has reached its redemption limit." };
  if (promo.maxPerCustomer != null && input.customerRedemptions >= promo.maxPerCustomer) return { ok: false, reason: "You've already used this code." };
  if (promo.firstTimeOnly && !input.isFirstTimeStudent) return { ok: false, reason: "This code is for first-time students." };
  if (promo.teacherId && product.teacherId && promo.teacherId !== product.teacherId) return { ok: false, reason: "This code doesn't apply to this teacher." };
  if (promo.appliesTo !== "all" && promo.appliesTo !== `${product.kind}s` && !(promo.appliesTo === "classes" && product.kind === "class")) {
    return { ok: false, reason: "This code doesn't apply to this type of purchase." };
  }
  if (product.kind === "class") {
    if (promo.classIds.length && product.classId && !promo.classIds.includes(product.classId)) return { ok: false, reason: "This code doesn't apply to this class." };
    if (promo.categoryIds.length && product.categoryId && !promo.categoryIds.includes(product.categoryId)) return { ok: false, reason: "This code doesn't apply to this category." };
    if (promo.cities.length && product.city && !promo.cities.map((city) => city.toLowerCase()).includes(product.city.toLowerCase())) {
      return { ok: false, reason: "This code doesn't apply in this city." };
    }
  }
  if (product.kind === "pack" && promo.packIds.length && product.packId && !promo.packIds.includes(product.packId)) {
    return { ok: false, reason: "This code doesn't apply to this pack." };
  }
  if (product.kind === "membership" && promo.membershipIds.length && product.membershipId && !promo.membershipIds.includes(product.membershipId)) {
    return { ok: false, reason: "This code doesn't apply to this membership." };
  }
  return { ok: true };
}

export function firstClassFreeEligible(input: { enabled: boolean; alreadyRedeemed: boolean; listPriceCents: number }): boolean {
  return input.enabled && !input.alreadyRedeemed && input.listPriceCents > 0;
}

export function offerCoversClass(offer: { classIds: string[]; categoryIds: string[] }, classId: string, categoryId: string): boolean {
  if (offer.classIds.length === 0 && offer.categoryIds.length === 0) return true;
  return offer.classIds.includes(classId) || offer.categoryIds.includes(categoryId);
}

export function canSpendPack(input: { creditsRemaining: number; expiresAt: Date | null; now: Date; covers: boolean }): { ok: true } | { ok: false; reason: string } {
  if (!input.covers) return { ok: false, reason: "This pack doesn't cover this class." };
  if (input.expiresAt && input.expiresAt < input.now) return { ok: false, reason: "This pack has expired." };
  if (input.creditsRemaining < 1) return { ok: false, reason: "This pack has no credits left." };
  return { ok: true };
}

export function canSpendMembership(input: {
  status: string;
  periodEnd: Date;
  now: Date;
  unlimited: boolean;
  classesPerPeriod: number | null;
  classesUsed: number;
  covers: boolean;
}): { ok: true } | { ok: false; reason: string } {
  if (input.status !== "active") return { ok: false, reason: "This membership isn't active." };
  if (input.periodEnd < input.now) return { ok: false, reason: "This membership period has ended." };
  if (!input.covers) return { ok: false, reason: "This membership doesn't cover this class." };
  if (!input.unlimited && input.classesPerPeriod != null && input.classesUsed >= input.classesPerPeriod) {
    return { ok: false, reason: "You've used all the classes in this period." };
  }
  return { ok: true };
}

export function shouldRestoreEntitlement(sessionStartsAt: Date, cancelledAt: Date): boolean {
  return cancelledAt.getTime() < sessionStartsAt.getTime();
}
