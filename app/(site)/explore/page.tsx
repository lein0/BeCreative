import { Suspense } from "react";
import { ClassCard, control, fromPrice } from "@/components/bits";
import { StudioMap } from "@/components/map-loader";
import { CLASS_FORMATS, DELIVERY_MODES, FORMAT_LABELS, LEVEL_LABELS, NEIGHBORHOODS, SKILL_LEVELS, type ClassFormat, type SkillLevel } from "@/lib/constants";
import { catalog, categoryTree, matchesServiceQuery, publishedServices } from "@/lib/queries";
import { money, one } from "@/lib/utils";

type Search = Promise<Record<string, string | string[] | undefined>>;

export default function ExplorePage({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<p className="px-5 py-10">Loading the map…</p>}>
      <ExploreBody searchParams={searchParams} />
    </Suspense>
  );
}

async function ExploreBody({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const near = one(sp.near);
  const place = NEIGHBORHOODS.find((item) => item.name === near);
  const vertical = one(sp.vertical);
  const categories = await categoryTree();
  const parents = categories.filter((category) => !category.parentId && (!vertical || category.vertical === vertical));
  const rows = await catalog({
    q: one(sp.q),
    category: one(sp.category),
    level: one(sp.level),
    format: one(sp.format),
    delivery: one(sp.delivery),
    maxPrice: one(sp.max) ? Number(one(sp.max)) : undefined,
    date: one(sp.date),
    lat: place?.lat,
    lng: place?.lng,
    miles: place ? Number(one(sp.miles) || 8) : undefined,
    vertical: vertical || undefined,
  });
  const { capture } = await import("@/lib/analytics");
  await capture({ name: "page_view", path: "/explore", platform: "web", vertical: vertical || null, category: one(sp.category), city: near || null });
  if (one(sp.q)) await capture({ name: "search", path: "/explore", platform: "web", properties: { q: one(sp.q)! } });
  const used = ["category", "level", "format", "delivery", "near", "vertical"].filter((key) => one(sp[key]));
  if (used.length) await capture({ name: "filter_used", path: "/explore", platform: "web", properties: { filters: used.join(",") } });
  const services = vertical === "wellness" ? await publishedServices() : [];
  const serviceRows = services.filter((row) => matchesServiceQuery(row, one(sp.q), one(sp.category)));
  const points = rows
    .filter((row) => row.location)
    .map((row) => ({
      id: row.class.id,
      title: row.class.title,
      href: `/c/${row.class.slug}`,
      lat: row.location!.lat,
      lng: row.location!.lng,
      meta: row.location!.neighborhood,
    }));
  return (
    <div data-brand={vertical === "wellness" ? "bewell" : undefined} className="mx-auto grid max-w-6xl gap-6 px-5 py-8 lg:grid-cols-[280px_1fr]">
      <form className="space-y-3 lg:sticky lg:top-24 lg:self-start">
        <h1 className="display text-4xl">{vertical === "wellness" ? "BeWell" : "Explore"}</h1>
        <select name="vertical" defaultValue={vertical} className={control}>
          <option value="">Creative and wellness</option>
          <option value="creative">Creative</option>
          <option value="wellness">Wellness</option>
        </select>
        <input name="q" defaultValue={one(sp.q)} placeholder="Search classes" className={control} />
        <select name="category" defaultValue={one(sp.category)} className={control}>
          <option value="">Any category</option>
          {parents.map((category) => (
            <option key={category.id} value={category.slug}>{category.name}</option>
          ))}
        </select>
        <select name="level" defaultValue={one(sp.level)} className={control}>
          <option value="">Any level</option>
          {SKILL_LEVELS.map((level) => <option key={level} value={level}>{LEVEL_LABELS[level as SkillLevel]}</option>)}
        </select>
        <select name="format" defaultValue={one(sp.format)} className={control}>
          <option value="">Any format</option>
          {CLASS_FORMATS.map((format) => <option key={format} value={format}>{FORMAT_LABELS[format as ClassFormat]}</option>)}
        </select>
        <select name="delivery" defaultValue={one(sp.delivery)} className={control}>
          <option value="">In person or virtual</option>
          {DELIVERY_MODES.map((mode) => <option key={mode} value={mode}>{mode === "in_person" ? "In person" : "Virtual"}</option>)}
        </select>
        <select name="near" defaultValue={near} className={control}>
          <option value="">Anywhere in LA</option>
          {NEIGHBORHOODS.map((item) => <option key={item.name}>{item.name}</option>)}
        </select>
        <input name="miles" defaultValue={one(sp.miles) || "8"} className={control} placeholder="Miles" />
        <input name="max" defaultValue={one(sp.max)} className={control} placeholder="Max price $" />
        <input name="date" type="date" defaultValue={one(sp.date)} className={control} />
        <button className="w-full rounded-full bg-ink py-2.5 text-sm text-paper">Update</button>
      </form>
      <div className="space-y-4">
        <StudioMap points={points} />
        <p className="text-sm text-ink/60">{rows.length} classes{serviceRows.length ? ` · ${serviceRows.length} visits` : ""}</p>
        {serviceRows.length ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {serviceRows.map((row) => (
              <ClassCard
                key={row.service.id}
                href={`/s/${row.service.slug}`}
                title={row.service.title}
                teacher={row.teacher.studioName || "Studio"}
                hue={160}
                price={row.service.kind === "access" ? money(row.service.priceCents) : "Private hour"}
                meta={[row.category.name, row.service.kind === "access" ? `${row.service.capacity} seats` : "1:1", row.location?.neighborhood].filter(Boolean).join(" · ")}
              />
            ))}
          </div>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          {rows.map((row, index) => (
            <ClassCard
              key={row.class.id}
              href={`/c/${row.class.slug}`}
              title={row.class.title}
              teacher={row.teacher.studioName || "Studio"}
              cover={row.class.coverImageUrl}
              hue={index * 17}
              price={fromPrice(row.class.pricePerSessionCents, row.class.pricePerSeriesCents)}
              meta={[row.location?.neighborhood, row.next ? row.next.localDate : "Dates soon", row.miles != null ? `${row.miles.toFixed(1)} mi` : row.class.delivery === "virtual" ? "Virtual" : ""].filter(Boolean).join(" · ")}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
