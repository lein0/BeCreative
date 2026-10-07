import { eq } from "drizzle-orm";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { pricingAction } from "@/lib/actions";
import { control, Panel } from "@/components/bits";
import { ShareButton } from "@/components/share-button";
import { requireActor } from "@/lib/actor";
import { db } from "@/lib/db";
import { promoCodes } from "@/lib/db/schema";
import { teacherByUser } from "@/lib/queries";

export default function PromosPage() {
  return <Suspense fallback={null}><Body /></Suspense>;
}

async function Body() {
  const actor = await requireActor();
  const teacher = await teacherByUser(actor.id);
  if (!teacher) redirect("/teach/onboarding");
  const codes = await db.select().from(promoCodes).where(eq(promoCodes.teacherId, teacher.id));
  return (
    <div>
      <h1 className="display text-5xl">Promo codes</h1>
      <p className="mt-2 max-w-xl text-sm text-ink/70">One code per order. Codes do not apply to free classes, first-class-free, or pack credits. Teacher codes are teacher-funded: you absorb the discount and the platform keeps its fee on the list price when the student payment covers it.</p>
      <form action={pricingAction} className="mt-4 grid max-w-xl gap-2">
        <input type="hidden" name="kind" value="promo" />
        <input type="hidden" name="teacherId" value={teacher.id} />
        <input name="code" required placeholder="MAYA10" className={control} />
        <select name="discountType" className={control}><option value="percent">Percent</option><option value="fixed">Fixed amount</option></select>
        <input name="percent" placeholder="Percent off" defaultValue="10" className={control} />
        <input name="amount" placeholder="Dollars off" className={control} />
        <input name="max" placeholder="Total uses" className={control} />
        <input name="perCustomer" placeholder="Per student" defaultValue="1" className={control} />
        <input name="minimum" placeholder="Minimum purchase $" className={control} />
        <label className="text-sm"><input type="checkbox" name="firstTime" /> First-time students only</label>
        <button className="rounded-full bg-clay px-4 py-2 text-sm text-white">Create code</button>
      </form>
      <div className="mt-6 space-y-2">
        {codes.map((code) => (
          <Panel key={code.id}>
            <div className="flex items-center justify-between gap-3">
              <span>{code.code} · {code.discountType === "percent" ? `${code.percentOffBps / 100}%` : `$${(code.amountOffCents / 100).toFixed(2)}`} · {code.active ? "active" : "off"}</span>
              <ShareButton path={`/t/${teacher.slug}?code=${code.code}`} title={`${teacher.studioName} · ${code.code}`} promos={[{ code: code.code }]} />
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}
