import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";

export async function applyContactPrefs(userId: string, formData: FormData, mode: "capture" | "checkout") {
  const phone = String(formData.get("phone") ?? "").trim();
  const sms = formData.get("smsOptIn") === "1";
  const marketing = formData.get("marketingOptIn") === "1";
  if (mode === "checkout") {
    if (!phone && !sms && !marketing) return;
    await db.update(user).set({
      ...(phone ? { phone } : {}),
      ...(sms ? { smsOptIn: true } : {}),
      ...(marketing ? { marketingOptIn: true } : {}),
    }).where(eq(user.id, userId));
    return;
  }
  await db.update(user).set({ phone: phone || null, smsOptIn: sms, marketingOptIn: marketing }).where(eq(user.id, userId));
}
