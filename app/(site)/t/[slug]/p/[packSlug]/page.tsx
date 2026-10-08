import { notFound } from "next/navigation";
import { Suspense } from "react";
import { buyOfferAction } from "@/lib/actions";
import { Panel } from "@/components/bits";
import { ShareButton } from "@/components/share-button";
import { teacherProfile } from "@/lib/queries";
import { studioCanSell } from "@/lib/review-rules";
import { money } from "@/lib/utils";

export default function PackPage({ params }: { params: Promise<{ slug: string; packSlug: string }> }) {
  return (
    <Suspense fallback={<p className="px-5 py-10">Loading pack…</p>}>
      <PackBody params={params} />
    </Suspense>
  );
}

async function PackBody({ params }: { params: Promise<{ slug: string; packSlug: string }> }) {
  const { slug, packSlug } = await params;
  const profile = await teacherProfile(slug);
  const pack = profile?.packs.find((item) => item.slug === packSlug);
  if (!profile || !studioCanSell(profile.teacher.status) || !pack) notFound();
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
        <form action={buyOfferAction} className="mt-5 space-y-3">
          <input type="hidden" name="kind" value="pack" />
          <input type="hidden" name="id" value={pack.id} />
          <input type="hidden" name="back" value={`/t/${slug}/p/${pack.slug}`} />
          <input name="code" placeholder="Promo code" className="w-full rounded-2xl border border-line px-3 py-2 uppercase" />
          <button className="rounded-full bg-clay px-5 py-3 text-sm text-white">Buy pack</button>
        </form>
      </Panel>
    </div>
  );
}
