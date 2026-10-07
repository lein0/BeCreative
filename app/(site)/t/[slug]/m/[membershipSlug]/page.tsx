import { notFound } from "next/navigation";
import { Suspense } from "react";
import { buyOfferAction } from "@/lib/actions";
import { Panel } from "@/components/bits";
import { ShareButton } from "@/components/share-button";
import { teacherProfile } from "@/lib/queries";
import { money } from "@/lib/utils";

export default function MembershipPage({ params }: { params: Promise<{ slug: string; membershipSlug: string }> }) {
  return (
    <Suspense fallback={<p className="px-5 py-10">Loading membership…</p>}>
      <Body params={params} />
    </Suspense>
  );
}

async function Body({ params }: { params: Promise<{ slug: string; membershipSlug: string }> }) {
  const { slug, membershipSlug } = await params;
  const profile = await teacherProfile(slug);
  const plan = profile?.memberships.find((item) => item.slug === membershipSlug);
  if (!profile || !plan) notFound();
  return (
    <div className="mx-auto max-w-xl px-5 py-10">
      <Panel>
        <div className="flex items-start justify-between gap-3">
          <h1 className="display text-5xl">{plan.name}</h1>
          <ShareButton path={`/t/${slug}/m/${plan.slug}`} title={plan.name} priceLabel={money(plan.priceCents)} eyebrow={profile.teacher.studioName ?? ""} />
        </div>
        <p className="mt-3">{plan.kind === "unlimited" ? "Unlimited classes" : `${plan.classesPerPeriod} classes / period`} · {plan.termMonths} month{plan.termMonths === 1 ? "" : "s"}</p>
        <p className="mt-2 text-lg">{money(plan.priceCents)}</p>
        <p className="mt-2 text-sm text-ink/70">{plan.pauseCancelPolicy}</p>
        <form action={buyOfferAction} className="mt-5 space-y-3">
          <input type="hidden" name="kind" value="membership" />
          <input type="hidden" name="id" value={plan.id} />
          <input type="hidden" name="back" value={`/t/${slug}/m/${plan.slug}`} />
          <input name="code" placeholder="Promo code" className="w-full rounded-2xl border border-line px-3 py-2 uppercase" />
          <button className="rounded-full bg-ink px-5 py-3 text-sm text-paper">Join</button>
        </form>
      </Panel>
    </div>
  );
}
