import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { phoneForStorage, phonesMatch } from "@/lib/phone";

/** Checkout only opts in when the box is checked. A different number does not inherit the old opt-in. */
export function checkoutContactPatch(input: {
  storedPhone: string | null;
  phone: string | null;
  sms: boolean;
  marketing: boolean;
}) {
  if (!input.phone && !input.sms && !input.marketing) return null;
  const phoneChanged = Boolean(input.phone) && !phonesMatch(input.storedPhone ?? "", input.phone ?? "");
  return {
    ...(input.phone ? { phone: input.phone } : {}),
    ...(input.sms ? { smsOptIn: true as const } : phoneChanged ? { smsOptIn: false as const } : {}),
    ...(input.marketing ? { marketingOptIn: true as const } : {}),
  };
}

export async function applyContactPrefs(userId: string, formData: FormData, mode: "capture" | "checkout") {
  const phone = phoneForStorage(String(formData.get("phone") ?? ""));
  const sms = formData.get("smsOptIn") === "1";
  const marketing = formData.get("marketingOptIn") === "1";
  if (mode === "checkout") {
    const [person] = await db.select({ phone: user.phone }).from(user).where(eq(user.id, userId)).limit(1);
    const patch = checkoutContactPatch({ storedPhone: person?.phone ?? null, phone, sms, marketing });
    if (!patch) return;
    await db.update(user).set(patch).where(eq(user.id, userId));
    return;
  }
  await db.update(user).set({ phone: phone || null, smsOptIn: sms, marketingOptIn: marketing }).where(eq(user.id, userId));
}
