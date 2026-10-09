import Link from "next/link";
import { eq } from "drizzle-orm";
import { Suspense } from "react";
import { Panel } from "@/components/bits";
import { db } from "@/lib/db";
import { faqArticles } from "@/lib/db/schema";

export const metadata = { title: "Help" };

export default function HelpPage({ searchParams }: { searchParams: Promise<{ q?: string; sent?: string; error?: string }> }) {
  return (
    <Suspense fallback={<p className="px-5 py-10">Loading help…</p>}>
      <Body searchParams={searchParams} />
    </Suspense>
  );
}

async function Body({ searchParams }: { searchParams: Promise<{ q?: string; sent?: string; error?: string }> }) {
  const query = await searchParams;
  const rows = await db.select().from(faqArticles).where(eq(faqArticles.published, true));
  const q = (query.q ?? "").trim().toLowerCase();
  const matches = rows.filter((row) => !q || `${row.title} ${row.body} ${row.category}`.toLowerCase().includes(q));
  return (
    <div className="mx-auto max-w-3xl px-5 py-8">
      <h1 className="display text-5xl">Help</h1>
      <p className="mt-2 text-ink/70">Search the guides first. A ticket is there when the guide does not cover it.</p>
      {query.sent ? <p className="mt-3 text-sm">Your note is with the studio or the BeCreative team.</p> : null}
      {query.error ? <p className="mt-3 text-sm text-clay">{query.error}</p> : null}
      <form className="mt-4" action="/help">
        <label className="block text-sm">Search
          <input name="q" defaultValue={query.q ?? ""} className="mt-1 w-full rounded-2xl border border-line bg-white px-3 py-2" placeholder="refund, pass, payout" />
        </label>
      </form>
      <div className="mt-6 space-y-3">
        {matches.map((article) => (
          <Panel key={article.id}>
            <p className="text-xs uppercase tracking-[0.14em] text-ink/50">{article.category}</p>
            <Link href={`/help/${article.slug}`} className="display text-2xl">{article.title}</Link>
          </Panel>
        ))}
        {!matches.length ? <p className="text-ink/60">Nothing matched. <Link className="text-clay" href="/help/safety">Report a problem</Link></p> : null}
      </div>
      <p className="mt-8 text-sm"><Link href="/help/safety" className="text-clay">Report a problem or a safety concern</Link></p>
    </div>
  );
}
