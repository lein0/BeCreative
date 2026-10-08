import Link from "next/link";
import { Suspense } from "react";
import { ClassCard, fromPrice } from "@/components/bits";
import { catalog, categoryTree, publishedServices } from "@/lib/queries";
import { money } from "@/lib/utils";

export const metadata = {
  title: "BeWell",
  description: "Yoga, bodywork, breath, and bathhouse time with independent practitioners. Book a class, a private hour, or a shared sauna slot.",
};

export default function WellnessPage() {
  return (
    <div data-brand="bewell" className="bg-paper text-ink">
      <section className="mx-auto grid max-w-6xl gap-8 px-5 py-16 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-clay">BeWell · Los Angeles</p>
          <h1 className="display mt-3 text-6xl leading-[0.92] sm:text-7xl">
            Slow hours,
            <span className="italic text-moss"> held simply.</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-ink/75">
            Yoga, Pilates, stretching, meditation, breathwork, sound baths, massage, Reiki, sauna, cold plunge, contrast, float, and bathhouses. Same login as BeCreative. No health records on file.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/explore?vertical=wellness" className="rounded-full bg-clay px-5 py-3 text-sm font-medium text-white">
              Explore wellness
            </Link>
            <Link href="/s/private-yoga" className="rounded-full border border-line bg-white px-5 py-3 text-sm">
              Book a private hour
            </Link>
          </div>
        </div>
        <div className="rounded-[32px] bg-moss p-6 text-paper">
          <p className="text-xs uppercase tracking-[0.16em] text-paper/60">How a visit works</p>
          <p className="display mt-3 text-4xl leading-tight">Pick a service, an open hour, and pay. A waiver, once, if the studio asks.</p>
          <p className="mt-4 text-sm text-paper/75">Packs and memberships spend one credit. A sauna holds a count of people, not a medical chart.</p>
        </div>
      </section>
      <Suspense fallback={<p className="px-5 pb-10 text-ink/50">Loading studios…</p>}>
        <Board />
      </Suspense>
    </div>
  );
}

async function Board() {
  const [classes, services, categories] = await Promise.all([
    catalog({ vertical: "wellness" }),
    publishedServices(),
    categoryTree(),
  ]);
  const parents = categories.filter((category) => category.vertical === "wellness" && !category.parentId);
  return (
    <div className="mx-auto max-w-6xl space-y-10 px-5 pb-16">
      <div className="flex flex-wrap gap-2">
        {parents.map((category) => (
          <Link key={category.id} href={`/explore?vertical=wellness&category=${category.slug}`} className="rounded-full bg-sand px-3 py-1.5 text-sm">
            {category.name}
          </Link>
        ))}
      </div>
      <section>
        <div className="mb-4 flex items-end justify-between">
          <h2 className="display text-4xl">Private hours and shared slots</h2>
          <Link href="/explore?vertical=wellness" className="text-sm text-clay">All of it</Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((row) => (
            <ClassCard
              key={row.service.id}
              href={`/s/${row.service.slug}`}
              title={row.service.title}
              teacher={row.teacher.studioName || "Studio"}
              hue={row.service.kind === "access" ? 150 : 168}
              price={row.service.kind === "access" ? money(row.service.priceCents) : "Choose a length"}
              meta={[row.category.name, row.service.kind === "access" ? `${row.service.capacity} people` : "One to one", row.location?.neighborhood].filter(Boolean).join(" · ")}
            />
          ))}
        </div>
      </section>
      <section>
        <h2 className="display mb-4 text-4xl">Group practices</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {classes.slice(0, 6).map((row, index) => (
            <ClassCard
              key={row.class.id}
              href={`/c/${row.class.slug}`}
              title={row.class.title}
              teacher={row.teacher.studioName || "Studio"}
              cover={row.class.coverImageUrl}
              hue={120 + index * 12}
              price={fromPrice(row.class.pricePerSessionCents, row.class.pricePerSeriesCents)}
              meta={[row.category.name, row.location?.neighborhood].filter(Boolean).join(" · ")}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
