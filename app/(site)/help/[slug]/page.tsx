import Link from "next/link";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { faqArticles } from "@/lib/db/schema";

export default async function HelpArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [article] = await db.select().from(faqArticles).where(eq(faqArticles.slug, slug)).limit(1);
  if (!article || !article.published) notFound();
  const { capture } = await import("@/lib/analytics");
  await capture({ name: "help_article_viewed", properties: { slug: article.slug } });
  return (
    <article className="mx-auto max-w-3xl px-5 py-8">
      <Link href="/help" className="text-sm text-clay">Help</Link>
      <p className="mt-4 text-xs uppercase tracking-[0.14em] text-ink/50">{article.category}</p>
      <h1 className="display text-5xl">{article.title}</h1>
      <p className="mt-4 whitespace-pre-wrap text-lg leading-relaxed">{article.body}</p>
    </article>
  );
}
