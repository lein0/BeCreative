import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { bookAction } from "@/lib/actions";
import { formatLabel, fromPrice, levelLabel, Money, Panel } from "@/components/bits";
import { ShareButton } from "@/components/share-button";
import { getActor } from "@/lib/actor";
import { quoteCode, trackView } from "@/lib/offers";
import { checkoutPolicyText } from "@/lib/policy-copy";
import { classDetail, walletForClass } from "@/lib/queries";
import { formatDateTimeInZone } from "@/lib/time";
import { money, one } from "@/lib/utils";

type Search = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const detail = await classDetail(slug);
  if (!detail) return { title: "Class" };
  const price = fromPrice(detail.class.pricePerSessionCents, detail.class.pricePerSeriesCents);
  const next = detail.upcoming.find((session) => session.status === "scheduled");
  return {
    title: detail.class.title,
    description: `${detail.class.title} with ${detail.teacher.studioName}. ${price}${next ? `. Next ${next.localDate}` : ""}.`,
    openGraph: { title: detail.class.title, description: detail.class.description, images: [`/api/og/class/${slug}`] },
    twitter: { card: "summary_large_image" as const, images: [`/api/og/class/${slug}`] },
  };
}

export default function ClassPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Search }) {
  return (
    <Suspense fallback={<p className="px-5 py-10">Loading class…</p>}>
      <ClassBody params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function ClassBody({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Search }) {
  const { slug } = await params;
  const sp = await searchParams;
  const detail = await classDetail(slug);
  if (!detail || detail.class.status === "archived") notFound();
  await trackView({ teacherId: detail.teacher.id, targetType: "class", targetId: detail.class.id, path: `/c/${slug}`, search: sp });
  const actor = await getActor();
  const code = one(sp.code);
  const list = detail.class.pricePerSessionCents ?? 0;
  const quote = await quoteCode({ code, listPriceCents: list, classId: detail.class.id, categoryId: detail.class.categoryId, teacherId: detail.teacher.id, city: detail.location?.city, userId: actor?.id ?? null });
  const wallet = actor ? await walletForClass(actor.id, detail.teacher.id) : null;
  const policy = await checkoutPolicyText();
  const focus = one(sp.session);
  const sessions = detail.upcoming.filter((session) => session.status === "scheduled" && (!focus || session.localDate === focus || session.id === focus));
  const next = sessions[0];
  const error = one(sp.error);
  return (
    <article className="mx-auto grid max-w-6xl gap-8 px-5 py-8 lg:grid-cols-[1.2fr_0.8fr]">
      <div>
        <div className="overflow-hidden rounded-[32px] bg-sand">
          {detail.class.coverImageUrl ? (
            <img src={detail.class.coverImageUrl} alt="" className="aspect-[16/9] w-full object-cover" />
          ) : (
            <div className="flex aspect-[16/9] items-end bg-gradient-to-br from-clay to-moss p-6 text-white">
              <h1 className="display text-5xl">{detail.class.title}</h1>
            </div>
          )}
        </div>
        <div className="mt-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-ink/50">{detail.category.name} · {levelLabel(detail.class.skillLevel)}</p>
            <h1 className="display text-5xl leading-none">{detail.class.title}</h1>
            <Link href={`/t/${detail.teacher.slug}`} className="mt-2 inline-block text-clay">{detail.teacher.studioName}</Link>
          </div>
          <ShareButton
            path={`/c/${detail.class.slug}${focus ? `?session=${focus}` : ""}`}
            title={detail.class.title}
            eyebrow={detail.teacher.studioName ?? "BeCreative"}
            priceLabel={fromPrice(detail.class.pricePerSessionCents, detail.class.pricePerSeriesCents)}
            when={next ? next.localDate : undefined}
            imageUrl={detail.class.coverImageUrl}
          />
        </div>
        <p className="mt-4 max-w-2xl text-lg text-ink/80">{detail.class.description}</p>
        <dl className="mt-6 grid gap-3 text-sm sm:grid-cols-3">
          <Panel><dt className="text-ink/50">Format</dt><dd>{formatLabel(detail.class.format)} · {detail.class.durationMinutes} min</dd></Panel>
          <Panel><dt className="text-ink/50">Where</dt><dd>{detail.class.delivery === "virtual" ? "Virtual" : `${detail.location?.neighborhood ?? "Los Angeles"}`}</dd></Panel>
          <Panel><dt className="text-ink/50">Size</dt><dd>Up to {detail.class.maxSize}</dd></Panel>
        </dl>
        {detail.class.outcomes ? <p className="mt-4 text-sm"><span className="font-medium">You leave able to </span>{detail.class.outcomes}</p> : null}
        {detail.class.whatToBring ? <p className="mt-2 text-sm text-ink/70">Bring {detail.class.whatToBring}</p> : null}
        {detail.reviews.length ? (
          <div className="mt-8 space-y-3">
            <h2 className="display text-3xl">Notes from students</h2>
            {detail.reviews.map((review) => (
              <Panel key={review.review.id}>
                <p className="text-sm text-clay">{"★".repeat(review.review.rating)}</p>
                <p className="mt-1">{review.review.body}</p>
                <p className="mt-2 text-xs text-ink/50">{review.name}</p>
              </Panel>
            ))}
          </div>
        ) : null}
      </div>
      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <Panel>
          <p className="text-xs uppercase tracking-[0.14em] text-ink/50">Checkout</p>
          <p className="display mt-1 text-4xl">{fromPrice(detail.class.pricePerSessionCents, detail.class.pricePerSeriesCents)}</p>
          {error ? <p className="mt-2 text-sm text-clay">{error}</p> : null}
          {code ? (
            <div className="mt-3 space-y-1 text-sm" data-testid="price-breakdown">
              <Row label="Class" value={money(quote.listPriceCents)} />
              <Row label={`Code ${code}`} value={quote.discountCents ? `−${money(quote.discountCents)}` : quote.codeError || "Not applied"} />
              <Row label="You pay" value={money(quote.studentPaysCents)} />
              <p className="text-xs text-ink/50">Platform fee on this booking is {money(quote.platformFeeCents)}{quote.platformLiabilityCents ? ` · promo liability ${money(quote.platformLiabilityCents)}` : ""}.</p>
            </div>
          ) : null}
          <form action={bookAction} className="mt-4 space-y-3">
            <input type="hidden" name="slug" value={detail.class.slug} />
            <input type="hidden" name="classId" value={detail.class.id} />
            <label className="block text-sm">
              Promo code
              <input name="code" defaultValue={code} className="mt-1 w-full rounded-2xl border border-line bg-white px-3 py-2 uppercase" placeholder="BECREATIVE15" />
            </label>
            <label className="block text-sm">
              Session
              <select name="sessionId" className="mt-1 w-full rounded-2xl border border-line bg-white px-3 py-2">
                {sessions.map((session) => (
                  <option key={session.id} value={session.id}>
                    {formatDateTimeInZone(session.startsAt)} · {session.spots} left
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              Pay with
              <select name="payWith" className="mt-1 w-full rounded-2xl border border-line bg-white px-3 py-2">
                <option value="cash">Card or pay at the studio</option>
                {wallet?.ownedPacks.filter((item) => item.purchase.creditsRemaining > 0).map((item) => (
                  <option key={item.purchase.id} value={`pack:${item.purchase.id}`}>{item.pack.name} · {item.purchase.creditsRemaining} left</option>
                ))}
                {wallet?.subs.map((item) => (
                  <option key={item.sub.id} value={`membership:${item.sub.id}`}>{item.plan.name}</option>
                ))}
              </select>
            </label>
            {detail.class.seriesBookingEnabled ? (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="series" value="1" /> Book the whole series ({money(detail.class.pricePerSeriesCents ?? list)})
              </label>
            ) : null}
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="policyAccepted" value="1" required className="mt-1" />
              <span>{policy}</span>
            </label>
            <button className="w-full rounded-full bg-clay py-3 text-sm font-medium text-white" disabled={!actor || !sessions.length}>
              {!actor ? "Sign in to book" : sessions.length ? "Book this session" : "No upcoming sessions"}
            </button>
            {!actor ? <Link href={`/login?next=/c/${detail.class.slug}`} className="block text-center text-sm text-clay">Sign in</Link> : null}
          </form>
        </Panel>
        {detail.packs.length ? (
          <Panel>
            <h2 className="display text-2xl">Packs</h2>
            {detail.packs.map((pack) => (
              <Link key={pack.id} href={`/t/${detail.teacher.slug}/p/${pack.slug}`} className="mt-2 block text-sm">
                {pack.name} · <Money cents={pack.priceCents} />
              </Link>
            ))}
          </Panel>
        ) : null}
      </aside>
    </article>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <p className="flex justify-between">
      <span>{label}</span>
      <span>{value}</span>
    </p>
  );
}
