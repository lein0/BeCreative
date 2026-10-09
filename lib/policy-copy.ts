import { db } from "@/lib/db";
import { platformSettings } from "@/lib/db/schema";
import { policySummary, SHIP_DEFAULTS } from "@/lib/ship-defaults";

export async function checkoutPolicyText() {
  const [settings] = await db.select().from(platformSettings).limit(1);
  return policySummary({
    fullRefundHours: settings?.studentFullRefundHours ?? SHIP_DEFAULTS.studentFullRefundHours,
    creditOnlyHours: settings?.studentCreditOnlyHours ?? SHIP_DEFAULTS.studentCreditOnlyHours,
    lateCancelFeeCents: settings?.lateCancelFeeCents ?? SHIP_DEFAULTS.lateCancelFeeCents,
    noShowFeeCents: settings?.noShowFeeCents ?? SHIP_DEFAULTS.noShowFeeCents,
  });
}
