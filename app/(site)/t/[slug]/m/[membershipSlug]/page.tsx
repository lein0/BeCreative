import { notFound } from "next/navigation";
import { Suspense } from "react";
import { buyOfferAction } from "@/lib/actions";
import { Panel } from "@/components/bits";
import { OfferPurchase } from "@/components/offer-purchase";
import { ShareButton } from "@/components/share-button";
import { getActor } from "@/lib/actor";
import { teacherProfile } from "@/lib/queries";
import { studioCanSell } from "@/lib/review-rules";
import { money, one } from "@/lib/utils";

type Search = Promise<Record<string, string | string[] | undefined>>;

export default function MembershipPage({ params, searchParams }: { params: Promise<{ slug: string; membershipSlug: string }>; searchParams: Search }) {
  return (
    <Suspense fallback={<p className="px-5 py-10">Loading membership…</p>}>
      <Body params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Body({ params, searchParams }: { params: Promise<{ slug: string; membershipSlug: string }>; searchParams: Search }) {
  const { slug, membershipSlug } = await params;
  const profile = await teacherProfile(slug);
  const plan = profile?.memberships.find((item) => item.slug === membershipSlug);
  if (!profile || !studioCanSell(profile.teacher.status) || !plan) notFound();
  const actor = await getActor();
  const error = one((await searchParams).error);
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
        <OfferPurchase error={error} signedIn={Boolean(actor)} back={`/t/${slug}/m/${plan.slug}`} kind="membership" offerId={plan.id} action={buyOfferAction} label="Join" tone="ink" />
      </Panel>
    </div>
  );
}
