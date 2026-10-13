import { Suspense } from "react";
import { redirect } from "next/navigation";
import { pricingAction } from "@/lib/actions";
import { scheduleMaterialChangeAction, schedulePriceChangeAction, teacherCancelMembershipAction } from "@/lib/renewal-actions";
import { control, Panel } from "@/components/bits";
import { ShareButton } from "@/components/share-button";
import { requireActor } from "@/lib/actor";
import { db } from "@/lib/db";
import { memberships, packs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { studioHome, teacherByUser } from "@/lib/queries";
import { formatRenewalDate } from "@/lib/renewal-copy";
import { teacherMembershipRoster } from "@/lib/renewal";
import { money } from "@/lib/utils";

export default function PricingPage({ searchParams }: { searchParams: Promise<{ cancelled?: string; error?: string; scheduled?: string }> }) {
  return <Suspense fallback={null}><Body searchParams={searchParams} /></Suspense>;
}

async function Body({ searchParams }: { searchParams: Promise<{ cancelled?: string; error?: string; scheduled?: string }> }) {
  const query = await searchParams;
  const actor = await requireActor();
  const teacher = await teacherByUser(actor.id);
  if (!teacher) redirect("/teach/onboarding");
  const home = await studioHome(teacher.id);
  const [packRows, plans, roster] = await Promise.all([
    db.select().from(packs).where(eq(packs.teacherId, teacher.id)),
    db.select().from(memberships).where(eq(memberships.teacherId, teacher.id)),
    teacherMembershipRoster(teacher.id),
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
        {query.cancelled ? <p className="mt-2 text-sm">Cancellation confirmed. The member keeps access until the paid term ends and will not be charged again.</p> : null}
        {query.error ? <p className="mt-2 text-sm">{query.error}</p> : null}
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
          <input name="introDays" type="number" min={0} placeholder="Intro days (optional)" className={control} />
          <input name="introPrice" placeholder="Intro price $ (blank = free intro)" className={control} />
          <button className="rounded-full bg-ink px-4 py-2 text-sm text-paper">Create membership</button>
        </form>
        <div className="mt-4 space-y-2">
          {plans.map((plan) => (
            <Panel key={plan.id}>
              <div className="flex items-center justify-between">
                <span>{plan.name} · {money(plan.priceCents)}</span>
                <ShareButton path={`/t/${teacher.slug}/m/${plan.slug}`} title={plan.name} priceLabel={money(plan.priceCents)} />
              </div>
              <form action={schedulePriceChangeAction} className="mt-3 space-y-2">
                <input type="hidden" name="teacherId" value={teacher.id} />
                <input type="hidden" name="membershipId" value={plan.id} />
                <input name="price" placeholder="New price $" className={control} />
                <input name="effective" type="date" required className={control} />
                <p className="text-xs text-ink/70">Existing members keep this price until a renewal on or after a date at least 14 days out.</p>
                <button className="rounded-full bg-ink px-3 py-1.5 text-sm text-paper">Schedule price change</button>
              </form>
              <form action={scheduleMaterialChangeAction} className="mt-3 space-y-2">
                <input type="hidden" name="teacherId" value={teacher.id} />
                <input type="hidden" name="membershipId" value={plan.id} />
                <input name="summary" placeholder="What is changing" className={control} />
                <input name="effective" type="date" required className={control} />
                <button className="rounded-full ring-1 ring-line px-3 py-1.5 text-sm">Schedule term change</button>
              </form>
              <div className="mt-3 space-y-2">
                {roster.filter((member) => member.membershipId === plan.id).map((member) => (
                  <div key={member.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span>{member.name || "Member"} · through {formatRenewalDate(member.currentPeriodEnd)}</span>
                    {member.cancelAtPeriodEnd ? <span className="text-ink/60">Cancels at period end</span> : (
                      <form action={teacherCancelMembershipAction}>
                        <input type="hidden" name="teacherId" value={teacher.id} />
                        <input type="hidden" name="subscriptionId" value={member.id} />
                        <button className="rounded-full ring-1 ring-line px-3 py-1.5 text-sm">Member asked me to cancel</button>
                      </form>
                    )}
                  </div>
                ))}
                {roster.some((member) => member.membershipId === plan.id && !member.cancelAtPeriodEnd) ? (
                  <p className="text-xs text-ink/70">Press this within 1 business day when a member asks you to cancel.</p>
                ) : null}
              </div>
            </Panel>
          ))}
        </div>
      </section>
    </div>
  );
}
