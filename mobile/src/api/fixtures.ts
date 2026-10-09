import type { PromoRule } from "../../../lib/pricing";

export const DEMO_EMAIL = "student@becreative.demo";
export const DEMO_PASSWORD = "DemoPass123!";

export const DEMO_PROMO: PromoRule = {
  code: "BECREATIVE15",
  active: true,
  discountType: "percent",
  percentOffBps: 1500,
  amountOffCents: 0,
  startsAt: null,
  endsAt: null,
  maxRedemptions: null,
  maxPerCustomer: null,
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
};
