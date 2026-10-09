import { Suspense } from "react";
import { faqAction } from "@/lib/support-actions";
import { control, Panel } from "@/components/bits";
import { db } from "@/lib/db";
import { faqArticles } from "@/lib/db/schema";

export default function AdminHelpPage() {
  return (
    <Suspense fallback={null}>
      <Body />
    </Suspense>
  );
}

async function Body() {
  const rows = await db.select().from(faqArticles);
  return (
    <div>
      <h1 className="display text-5xl">Help articles</h1>
      <form action={faqAction} className="mt-4 grid max-w-lg gap-2 text-sm">
        <label>Slug<input name="slug" required className={control} /></label>
        <label>Title<input name="title" required className={control} /></label>
        <label>Category<input name="category" defaultValue="booking" className={control} /></label>
        <label>Body<textarea name="body" required className={`${control} min-h-28`} /></label>
        <label className="flex items-center gap-2"><input type="checkbox" name="published" value="1" defaultChecked /> Published</label>
        <button className="rounded-full bg-ink px-3 py-1.5 text-paper">Save article</button>
      </form>
      <div className="mt-6 space-y-2">
        {rows.map((article) => <Panel key={article.id}>{article.category} · {article.title}</Panel>)}
      </div>
    </div>
  );
}
