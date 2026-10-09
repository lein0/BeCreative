import { Suspense } from "react";
import { redirect } from "next/navigation";
import { pricingAction } from "@/lib/actions";
import { control, Panel } from "@/components/bits";
import { ShareButton } from "@/components/share-button";
import { requireActor } from "@/lib/actor";
import { db } from "@/lib/db";
import { memberships, packs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { studioHome, teacherByUser } from "@/lib/queries";
import { money } from "@/lib/utils";

export default function PricingPage() {
  return <Suspense fallback={null}><Body /></Suspense>;
}

async function Body() {
  const actor = await requireActor();
  const teacher = await teacherByUser(actor.id);
  if (!teacher) redirect("/teach/onboarding");
  const home = await studioHome(teacher.id);
  const [packRows, plans] = await Promise.all([
    db.select().from(packs).where(eq(packs.teacherId, teacher.id)),
    db.select().from(memberships).where(eq(memberships.teacherId, teacher.id)),
  ]);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section>
        <h1 className="display text-5xl">Packs</h1>
        <form action={pricingAction} className="mt-4 space-y-2">
          <input type="hidden" name="kind" value="pack" />
          <input type="hidden" name="teacherId" value={teacher.id} />
          <input name="name" required placeholder="5-class pack" className={control} />
          <input name="credits" type="number" defaultValue={5} className={control} />
          <input name="price" placeholder="Price $" className={control} defaultValue="140" />
          <input name="expiry" type="number" defaultValue={90} className={control} />
          <textarea name="description" placeholder="What the pack covers" className={control} />
          <div className="text-sm">{home.classRows.map((klass) => <label key={klass.id} className="mr-3 inline-flex items-center gap-1"><input type="checkbox" name="classId" value={klass.id} />{klass.title}</label>)}</div>
          <button className="rounded-full bg-clay px-4 py-2 text-sm text-white">Create pack</button>
        </form>
        <div className="mt-4 space-y-2">
          {packRows.map((pack) => (
            <Panel key={pack.id}>
              <div className="flex items-center justify-between">
                <span>{pack.name} · {pack.creditCount} · {money(pack.priceCents)}</span>
                <ShareButton path={`/t/${teacher.slug}/p/${pack.slug}`} title={pack.name} priceLabel={money(pack.priceCents)} />
              </div>
            </Panel>
          ))}
        </div>
      </section>
      <section>
        <h2 className="display text-5xl">Memberships</h2>
        <form action={pricingAction} className="mt-4 space-y-2">
          <input type="hidden" name="kind" value="membership" />
          <input type="hidden" name="teacherId" value={teacher.id} />
          <input name="name" required placeholder="Monthly studio" className={control} />
          <select name="term" className={control}><option value="1">1 month</option><option value="3">3 months</option><option value="12">12 months</option></select>
          <select name="cap" className={control}><option value="unlimited">Unlimited</option><option value="capped">N per period</option></select>
          <input name="perPeriod" type="number" defaultValue={4} className={control} />
          <input name="price" defaultValue="120" className={control} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="recurring" defaultChecked /> Recurring</label>
          <textarea name="policy" placeholder="Pause and cancel policy" className={control} defaultValue="Cancel anytime before the next renewal. Pause up to 30 days." />
          <button className="rounded-full bg-ink px-4 py-2 text-sm text-paper">Create membership</button>
        </form>
        <div className="mt-4 space-y-2">
          {plans.map((plan) => (
            <Panel key={plan.id}>
              <div className="flex items-center justify-between">
                <span>{plan.name} · {money(plan.priceCents)}</span>
                <ShareButton path={`/t/${teacher.slug}/m/${plan.slug}`} title={plan.name} priceLabel={money(plan.priceCents)} />
              </div>
            </Panel>
          ))}
        </div>
      </section>
    </div>
  );
}
