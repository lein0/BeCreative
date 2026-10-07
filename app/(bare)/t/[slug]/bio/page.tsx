import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { fromPrice } from "@/components/bits";
import { trackView } from "@/lib/offers";
import { teacherProfile } from "@/lib/queries";
import { formatDateTimeInZone } from "@/lib/time";

export default function BioPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <Suspense fallback={<p className="p-6">Loading…</p>}>
      <Bio params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Bio({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const profile = await teacherProfile(slug);
  if (!profile || profile.teacher.status !== "approved") notFound();
  await trackView({ teacherId: profile.teacher.id, targetType: "bio", targetId: profile.teacher.id, path: `/t/${slug}/bio`, search: sp });
  const byClass = new Map(profile.offerings.map((item) => [item.id, item]));
  return (
    <main className="mx-auto min-h-screen max-w-md px-4 py-8" data-testid="link-in-bio">
      <div className="text-center">
        <div className="mx-auto h-24 w-24 overflow-hidden rounded-full bg-moss">
          {profile.teacher.photoUrl ? <img src={profile.teacher.photoUrl} alt="" className="h-full w-full object-cover" /> : null}
        </div>
        <h1 className="display mt-4 text-4xl">{profile.teacher.studioName}</h1>
        <p className="mt-2 text-sm text-ink/70">{profile.teacher.bio}</p>
      </div>
      <div className="mt-6 space-y-3">
        {profile.offerings.map((klass) => {
          const upcoming = profile.upcoming.filter((session) => session.classId === klass.id).slice(0, 3);
          return (
            <section key={klass.id} className="rounded-3xl bg-white p-4 ring-1 ring-line">
              <p className="display text-2xl">{klass.title}</p>
              <p className="text-sm text-ink/60">{fromPrice(klass.pricePerSessionCents, klass.pricePerSeriesCents)}</p>
              <div className="mt-3 space-y-2">
                {upcoming.map((session) => (
                  <Link key={session.id} href={`/c/${klass.slug}?session=${session.localDate}&ref=bio`} className="flex items-center justify-between rounded-2xl bg-ink px-3 py-2 text-sm text-paper">
                    <span>{formatDateTimeInZone(session.startsAt)}</span>
                    <span>Book</span>
                  </Link>
                ))}
                {!upcoming.length ? <Link href={`/c/${byClass.get(klass.id)?.slug}?ref=bio`} className="block rounded-2xl bg-clay px-3 py-2 text-center text-sm text-white">See class</Link> : null}
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}
