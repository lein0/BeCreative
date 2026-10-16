import { eq } from "drizzle-orm";
import { Suspense } from "react";
import { feeAction } from "@/lib/actions";
import { control } from "@/components/bits";
import { db } from "@/lib/db";
import { platformSettings } from "@/lib/db/schema";

export default function SettingsPage() {
  return <Suspense fallback={null}><Body /></Suspense>;
}

async function Body() {
  const [fee] = await db.select().from(platformSettings).where(eq(platformSettings.id, 1));
  return (
    <div>
      <h1 className="display text-5xl">Fees</h1>
      <form action={feeAction} className="mt-4 grid max-w-sm gap-2">
        <label className="text-sm">Percent<input name="percent" defaultValue={fee?.feePercent ?? 10} className={control} /></label>
        <label className="text-sm">Fixed dollars<input name="fixed" defaultValue={((fee?.feeFixedCents ?? 0) / 100).toString()} className={control} /></label>
        <button className="rounded-full bg-ink px-4 py-2 text-sm text-paper">Save fee</button>
      </form>
    </div>
  );
}
