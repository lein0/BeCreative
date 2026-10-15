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

export default function PackPage({ params, searchParams }: { params: Promise<{ slug: string; packSlug: string }>; searchParams: Search }) {
  return (
    <Suspense fallback={<p className="px-5 py-10">Loading pack…</p>}>
      <PackBody params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function PackBody({ params, searchParams }: { params: Promise<{ slug: string; packSlug: string }>; searchParams: Search }) {
  const { slug, packSlug } = await params;
  const profile = await teacherProfile(slug);
  const pack = profile?.packs.find((item) => item.slug === packSlug);
  if (!profile || !studioCanSell(profile.teacher.status) || !pack) notFound();
  const actor = await getActor();
  const error = one((await searchParams).error);
  return (
    <div className="mx-auto max-w-xl px-5 py-10">
      <Panel>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-ink/50">{profile.teacher.studioName}</p>
            <h1 className="display text-5xl">{pack.name}</h1>
          </div>
          <ShareButton path={`/t/${slug}/p/${pack.slug}`} title={pack.name} priceLabel={money(pack.priceCents)} eyebrow={profile.teacher.studioName ?? ""} promos={profile.codes.map((code) => ({ code: code.code }))} />
        </div>
        <p className="mt-3">{pack.description}</p>
        <p className="mt-3 text-lg">{pack.creditCount} classes · {money(pack.priceCents)} · expires in {pack.expiryDays} days</p>
        <OfferPurchase error={error} signedIn={Boolean(actor)} back={`/t/${slug}/p/${pack.slug}`} kind="pack" offerId={pack.id} action={buyOfferAction} label="Buy pack" />
      </Panel>
    </div>
  );
}
