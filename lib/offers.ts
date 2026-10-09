import { and, eq, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { platformSettings, promoCodes, promoRedemptions } from "@/lib/db/schema";
import { priorWithTeacher } from "@/lib/booking-service";
import { quotePrice, type PromoRule } from "@/lib/pricing";
import { classPromoDecision } from "@/lib/review-rules";
import { recordClick } from "@/lib/queries";
import { one } from "@/lib/utils";

export async function platformFee() {
  const [fee] = await db.select().from(platformSettings).where(eq(platformSettings.id, 1)).limit(1);
  return { feePercent: fee?.feePercent ?? 10, feeFixedCents: fee?.feeFixedCents ?? 0 };
}

export function toPromo(row: typeof promoCodes.$inferSelect): PromoRule {
  return {
    code: row.code,
    active: row.active,
    discountType: row.discountType as PromoRule["discountType"],
    percentOffBps: row.percentOffBps,
    amountOffCents: row.amountOffCents,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    maxRedemptions: row.maxRedemptions,
    maxPerCustomer: row.maxPerCustomer,
    firstTimeOnly: row.firstTimeOnly,
    minPurchaseCents: row.minPurchaseCents,
    funding: row.funding as PromoRule["funding"],
    platformSharePercent: row.platformSharePercent,
    appliesTo: row.appliesTo as PromoRule["appliesTo"],
    teacherId: row.teacherId,
    classIds: row.classIds,
    categoryIds: row.categoryIds,
    packIds: row.packIds,
    membershipIds: row.membershipIds,
    cities: row.cities,
  };
}

export async function quoteCode(input: { code?: string; listPriceCents: number; classId: string; categoryId: string; teacherId: string | null; city?: string; userId?: string | null }) {
  const fee = await platformFee();
  const code = input.code?.trim().toUpperCase();
  if (!code || input.listPriceCents <= 0) return quotePrice({ listPriceCents: input.listPriceCents, ...fee });
  const [row] = await db.select().from(promoCodes).where(eq(promoCodes.code, code)).limit(1);
  if (!row) return quotePrice({ listPriceCents: input.listPriceCents, ...fee, promoError: "That code is not active." });
  const promo = toPromo(row);
  const [totals] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(promoRedemptions)
    .where(and(eq(promoRedemptions.promoCodeId, row.id), eq(promoRedemptions.reversed, false)));
  let customerRedemptions = 0;
  if (input.userId) {
    const [mine] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(promoRedemptions)
      .where(and(eq(promoRedemptions.promoCodeId, row.id), eq(promoRedemptions.userId, input.userId), eq(promoRedemptions.reversed, false)));
    customerRedemptions = Number(mine?.count ?? 0);
  }
  let isFirstTimeStudent = true;
  if (input.userId && input.teacherId) {
    isFirstTimeStudent = !(await priorWithTeacher(input.userId, input.teacherId));
  }
  const check = classPromoDecision({
    promo,
    now: new Date(),
    listPriceCents: input.listPriceCents,
    product: { kind: "class", classId: input.classId, categoryId: input.categoryId, teacherId: input.teacherId, city: input.city ?? "Los Angeles" },
    totalRedemptions: Number(totals?.count ?? 0),
    customerRedemptions,
    isFirstTimeStudent,
  });
  return quotePrice({ listPriceCents: input.listPriceCents, ...fee, promo: check.ok ? promo : null, promoError: check.ok ? null : check.reason });
}

export async function trackView(input: {
  teacherId: string;
  targetType: string;
  targetId?: string;
  path: string;
  search: Record<string, string | string[] | undefined>;
}) {
  const jar = await cookies();
  const raw = jar.get("bc_attr")?.value;
  let attr: { ref?: string; utm_source?: string; utm_medium?: string; utm_campaign?: string } = {};
  if (raw) {
    try {
      attr = JSON.parse(raw) as typeof attr;
    } catch {
      attr = {};
    }
  }
  await recordClick({
    teacherId: input.teacherId,
    targetType: input.targetType,
    targetId: input.targetId,
    path: input.path,
    code: one(input.search.code) || jar.get("bc_code")?.value,
    ref: one(input.search.ref) || attr.ref || input.targetType,
    utmSource: one(input.search.utm_source) || attr.utm_source,
    utmMedium: one(input.search.utm_medium) || attr.utm_medium,
    utmCampaign: one(input.search.utm_campaign) || attr.utm_campaign,
  });
}
