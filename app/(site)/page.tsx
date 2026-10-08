import Link from "next/link";
import { Suspense } from "react";
import { ClassCard, fromPrice, formatLabel, levelLabel } from "@/components/bits";
import { catalog } from "@/lib/queries";

export default function HomePage() {
  return (
    <div>
      <section className="mx-auto grid max-w-6xl gap-8 px-5 py-16 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-clay">Los Angeles</p>
          <h1 className="display mt-3 text-6xl leading-[0.92] sm:text-7xl">
            Classes with the teacher,
            <span className="italic text-moss"> not the marketplace.</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-ink/70">
            Scene study, ceramics, voice, salsa. Teachers set the price. Students book a session, a series, a pack, or a membership.
          </p>
          <div className="mt-8 flex gap-3">
            <Link href="/explore" className="rounded-full bg-clay px-5 py-3 text-sm font-medium text-white">
              Explore the map
            </Link>
            <Link href="/signup" className="rounded-full border border-line bg-white px-5 py-3 text-sm">
              Teach on BeCreative
            </Link>
            <Link href="/wellness" className="rounded-full border border-line bg-white px-5 py-3 text-sm">
              BeWell
            </Link>
          </div>
        </div>
        <div className="rounded-[32px] bg-moss p-6 text-paper">
          <p className="text-xs uppercase tracking-[0.16em] text-paper/60">This week</p>
          <p className="display mt-3 text-4xl leading-tight">Drop in tonight, or hold your seat for the whole series.</p>
          <p className="mt-4 text-sm text-paper/75">Promo codes, class packs, and first-class-free offers apply at checkout. No credit subscription.</p>
        </div>
      </section>
      <Suspense fallback={<p className="px-5 text-ink/50">Loading classes…</p>}>
        <Featured />
      </Suspense>
    </div>
  );
}

async function Featured() {
  const rows = (await catalog({})).filter((row) => row.class.featured).slice(0, 6);
  const list = rows.length ? rows : (await catalog({})).slice(0, 6);
  return (
    <section className="mx-auto max-w-6xl px-5 pb-8">
      <div className="mb-4 flex items-end justify-between">
        <h2 className="display text-4xl">On the board</h2>
        <Link href="/explore" className="text-sm text-clay">
          All classes
        </Link>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((row, index) => (
          <ClassCard
            key={row.class.id}
            href={`/c/${row.class.slug}`}
            title={row.class.title}
            teacher={row.teacher.studioName || "Studio"}
            cover={row.class.coverImageUrl}
            hue={index * 28}
            price={fromPrice(row.class.pricePerSessionCents, row.class.pricePerSeriesCents)}
            meta={`${formatLabel(row.class.format)} · ${levelLabel(row.class.skillLevel)}`}
          />
        ))}
      </div>
    </section>
  );
}
