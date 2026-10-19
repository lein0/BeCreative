import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { fromPrice } from "@/components/bits";
import { teacherProfile } from "@/lib/queries";

export default function EmbedPage({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <Suspense fallback={<p className="p-4">Loading…</p>}>
      <Embed params={params} />
    </Suspense>
  );
}

async function Embed({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const profile = await teacherProfile(slug);
  if (!profile) notFound();
  return (
    <main className="mx-auto max-w-sm p-4">
      <p className="text-xs uppercase tracking-[0.16em] text-clay">Book with me</p>
      <h1 className="display text-4xl">{profile.teacher.studioName}</h1>
      <div className="mt-4 space-y-2">
        {profile.offerings.map((klass) => (
          <Link key={klass.id} href={`/c/${klass.slug}?ref=embed`} className="block rounded-2xl bg-ink px-4 py-3 text-paper">
            <span className="block">{klass.title}</span>
            <span className="text-sm text-paper/70">{fromPrice(klass.pricePerSessionCents, klass.pricePerSeriesCents)}</span>
          </Link>
        ))}
      </div>
    </main>
  );
}
