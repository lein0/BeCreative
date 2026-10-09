import { notFound } from "next/navigation";
import { Suspense } from "react";
import { buyOfferAction } from "@/lib/actions";
import { Panel } from "@/components/bits";
import { RenewalCheckout } from "@/components/renewal-checkout";
import { ShareButton } from "@/components/share-button";
import { disclosureForMembership } from "@/lib/renewal";
import { purchaseButtonLabel } from "@/lib/renewal-copy";
import { teacherProfile } from "@/lib/queries";
import { studioCanSell } from "@/lib/review-rules";
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
  if (!profile || !studioCanSell(profile.teacher.status) || !plan) notFound();
  const prepared = plan.recurring ? await disclosureForMembership(plan.id) : null;
  const button = purchaseButtonLabel({ todayCents: plan.priceCents, renewalCents: plan.priceCents, termMonths: plan.termMonths, introFree: false });
  return (
    <div className="mx-auto max-w-xl px-4 py-4">
      <Panel>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{plan.name}</h1>
            <p className="text-base">{profile.teacher.studioName} · {money(plan.priceCents)} · {plan.kind === "unlimited" ? "Unlimited classes" : `${plan.classesPerPeriod} classes / period`}</p>
          </div>
          <ShareButton path={`/t/${slug}/m/${plan.slug}`} title={plan.name} priceLabel={money(plan.priceCents)} eyebrow={profile.teacher.studioName ?? ""} />
        </div>
        {prepared ? (
          <RenewalCheckout action={buyOfferAction} disclosure={prepared.disclosure} hidden={{ kind: "membership", id: plan.id, back: `/t/${slug}/m/${plan.slug}` }} />
        ) : (
          <form action={buyOfferAction} className="mt-5 space-y-3">
            <input type="hidden" name="kind" value="membership" />
            <input type="hidden" name="id" value={plan.id} />
            <input type="hidden" name="back" value={`/t/${slug}/m/${plan.slug}`} />
            <input name="code" placeholder="Promo code" className="w-full rounded-2xl border border-line px-3 py-2 uppercase" />
            <button className="rounded-full bg-ink px-5 py-3 text-base text-paper">{button}</button>
          </form>
        )}
      </Panel>
    </div>
  );
}
