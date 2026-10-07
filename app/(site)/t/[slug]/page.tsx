import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { fromPrice, Panel } from "@/components/bits";
import { EmbedSnippet, ShareButton } from "@/components/share-button";
import { trackView } from "@/lib/offers";
import { teacherProfile } from "@/lib/queries";
import { formatDateTimeInZone } from "@/lib/time";
import { money } from "@/lib/utils";

type Search = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const profile = await teacherProfile(slug);
  if (!profile) return { title: "Teacher" };
  const prices = profile.offerings.map((item) => item.pricePerSessionCents).filter((value): value is number => value != null);
  const from = prices.length ? `From ${money(Math.min(...prices))}` : "";
  return {
    title: profile.teacher.studioName ?? profile.person?.name ?? "Teacher",
    description: profile.teacher.bio,
    openGraph: { images: [`/t/${slug}/opengraph-image`] },
    other: from ? { price: from } : undefined,
  };
}

export default function TeacherPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Search }) {
  return (
    <Suspense fallback={<p className="px-5 py-10">Loading teacher…</p>}>
      <TeacherBody params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function TeacherBody({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Search }) {
  const { slug } = await params;
  const sp = await searchParams;
  const profile = await teacherProfile(slug);
  if (!profile || profile.teacher.status !== "approved") notFound();
  await trackView({ teacherId: profile.teacher.id, targetType: "profile", targetId: profile.teacher.id, path: `/t/${slug}`, search: sp });
  const prices = profile.offerings.map((item) => item.pricePerSessionCents).filter((value): value is number => value != null);
  const from = prices.length ? `from ${money(Math.min(...prices))}` : undefined;
  const next = profile.upcoming[0];
  return (
    <div className="mx-auto max-w-6xl px-5 py-8">
      <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
        <div>
          <div className="aspect-square overflow-hidden rounded-[32px] bg-moss">
            {profile.teacher.photoUrl ? <img src={profile.teacher.photoUrl} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-end p-4 text-4xl text-paper display">{profile.teacher.studioName}</div>}
          </div>
        </div>
        <div>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-clay">{profile.teacher.specialties.join(" · ")}</p>
              <h1 className="display text-6xl leading-none">{profile.teacher.studioName}</h1>
              <p className="mt-2 text-ink/60">{profile.person?.name}</p>
            </div>
            <div className="flex gap-2">
              <ShareButton path={`/t/${profile.teacher.slug}`} title={profile.teacher.studioName || "Teacher"} eyebrow="Teacher" priceLabel={from} when={next ? `Next ${next.localDate}` : undefined} imageUrl={profile.teacher.photoUrl} promos={profile.codes.map((code) => ({ code: code.code }))} />
              <Link href={`/t/${profile.teacher.slug}/bio`} className="rounded-full bg-ink px-4 py-2 text-sm text-paper">Link in bio</Link>
            </div>
          </div>
          <p className="mt-5 max-w-2xl text-lg">{profile.teacher.bio}</p>
          <div className="mt-6 flex flex-wrap gap-3 text-sm">
            {profile.teacher.instagram ? <span>IG {profile.teacher.instagram}</span> : null}
            {profile.teacher.website ? <span>{profile.teacher.website}</span> : null}
          </div>
        </div>
      </div>
      <h2 className="display mt-10 text-4xl">Classes</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {profile.offerings.map((klass) => (
          <Link key={klass.id} href={`/c/${klass.slug}`} className="rounded-3xl border border-line bg-mist p-4">
            <p className="display text-3xl">{klass.title}</p>
            <p className="mt-2 text-sm text-ink/70">{fromPrice(klass.pricePerSessionCents, klass.pricePerSeriesCents)} · {klass.durationMinutes} min</p>
          </Link>
        ))}
      </div>
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <Panel>
          <h2 className="display text-3xl">Offers</h2>
          {profile.packs.map((pack) => <Link key={pack.id} className="mt-2 block" href={`/t/${slug}/p/${pack.slug}`}>{pack.name} · {money(pack.priceCents)}</Link>)}
          {profile.memberships.map((plan) => <Link key={plan.id} className="mt-2 block" href={`/t/${slug}/m/${plan.slug}`}>{plan.name} · {money(plan.priceCents)}</Link>)}
        </Panel>
        <Panel>
          <EmbedSnippet slug={slug} />
        </Panel>
      </div>
      {profile.reviews.length ? (
        <div className="mt-8 grid gap-3 md:grid-cols-2">
          {profile.reviews.map((review) => (
            <Panel key={review.review.id}><p>{"★".repeat(review.review.rating)} {review.review.body}</p><p className="mt-2 text-xs text-ink/50">{review.name}</p></Panel>
          ))}
        </div>
      ) : null}
      {next ? <p className="mt-6 text-sm text-ink/60">Next session {formatDateTimeInZone(next.startsAt)}</p> : null}
    </div>
  );
}
