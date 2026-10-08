import { notFound } from "next/navigation";
import { LEGAL_PAGES, legalBody } from "@/lib/legal";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = LEGAL_PAGES.find((item) => item.slug === slug);
  return { title: page ? `${page.title} (draft)` : "Legal" };
}

export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = LEGAL_PAGES.find((item) => item.slug === slug);
  if (!page) notFound();
  return (
    <article className="mx-auto max-w-3xl px-5 py-8">
      <p className="rounded-2xl bg-sand px-4 py-3 text-sm font-medium">DRAFT FOR LAWYER REVIEW</p>
      <h1 className="display mt-4 text-5xl">{page.title}</h1>
      <p className="mt-4 whitespace-pre-wrap text-lg leading-relaxed">{legalBody(slug)}</p>
    </article>
  );
}
