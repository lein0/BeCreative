import { Suspense } from "react";
import { adminPromoAction } from "@/lib/actions";
import { control, Panel } from "@/components/bits";
import { db } from "@/lib/db";
import { promoCodes, teachers } from "@/lib/db/schema";
import { money } from "@/lib/utils";

export default function AdminPromos() {
  return <Suspense fallback={null}><Body /></Suspense>;
}

async function Body() {
  const codes = await db.select().from(promoCodes);
  const teacherRows = await db.select().from(teachers);
  const names = new Map(teacherRows.map((teacher) => [teacher.id, teacher.studioName]));
  return (
    <div>
      <h1 className="display text-5xl">Promos</h1>
      <p className="mt-2 max-w-2xl text-sm text-ink/70">Platform-funded codes keep the teacher at the full-price net. If the fee cannot absorb the discount, the difference is liability. Teacher-funded codes come out of the teacher baseline. Split uses the platform share of the discount. The ledger is the orders table; Stripe is charged the discounted student amount, not a Stripe coupon.</p>
      <form action={adminPromoAction} className="mt-4 grid max-w-lg gap-2">
        <input name="code" placeholder="SITEWIDE" className={control} required />
        <input name="percent" defaultValue="15" className={control} />
        <select name="funding" className={control}><option value="platform">Platform-funded</option><option value="teacher">Teacher-funded</option><option value="split">Split</option></select>
        <input name="share" placeholder="Platform share % if split" className={control} />
        <button className="rounded-full bg-clay px-4 py-2 text-sm text-white">Create platform code</button>
      </form>
      <div className="mt-4 space-y-2">
        {codes.map((code) => (
          <Panel key={code.id}>
            <div className="flex items-center justify-between gap-3">
              <span>{code.code} · {code.funding} · {names.get(code.teacherId ?? "") || "platform"} · {code.discountType === "percent" ? `${code.percentOffBps / 100}%` : money(code.amountOffCents)} · {code.active ? "active" : "off"}</span>
              {code.active ? <form action={adminPromoAction}><input type="hidden" name="command" value="deactivate" /><input type="hidden" name="id" value={code.id} /><button className="text-sm text-clay">Deactivate</button></form> : null}
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}
