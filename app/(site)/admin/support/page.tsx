import Link from "next/link";
import { desc } from "drizzle-orm";
import { Suspense } from "react";
import { supportReplyAction } from "@/lib/support-actions";
import { control, Panel } from "@/components/bits";
import { db } from "@/lib/db";
import { cannedReplies, tickets } from "@/lib/db/schema";

export default function SupportInboxPage() {
  return (
    <Suspense fallback={null}>
      <Body />
    </Suspense>
  );
}

async function Body() {
  const rows = await db.select().from(tickets).orderBy(desc(tickets.updatedAt));
  const canned = await db.select().from(cannedReplies);
  return (
    <div>
      <h1 className="display text-5xl">Support</h1>
      <p className="mt-2 text-sm text-ink/70">Class questions start with the teacher and move here after 24 hours without a reply. Payment and safety arrive immediately.</p>
      <div className="mt-6 space-y-3">
        {rows.map((ticket) => (
          <Panel key={ticket.id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">{ticket.subject}</p>
                <p className="text-sm text-ink/60">{ticket.category} · {ticket.priority} · {ticket.status} · {ticket.route}{ticket.slaDueAt ? ` · reply by ${ticket.slaDueAt.toLocaleString()}` : ""}{ticket.csatScore ? ` · ${ticket.csatScore}/5` : ""}</p>
              </div>
              <Link href={`/admin/support/${ticket.id}`} className="text-sm text-clay">Open</Link>
            </div>
          </Panel>
        ))}
        {!rows.length ? <p className="text-sm text-ink/60">The inbox is empty.</p> : null}
      </div>
      <form action={supportReplyAction} className="mt-8 grid max-w-lg gap-2 text-sm">
        <input type="hidden" name="command" value="canned" />
        <input type="hidden" name="back" value="/admin/support" />
        <h2 className="display text-3xl">Canned reply</h2>
        <input name="title" placeholder="Title" className={control} required />
        <textarea name="cannedBody" placeholder="Reply text" className={`${control} min-h-20`} required />
        <input name="category" placeholder="class" className={control} />
        <button className="rounded-full bg-ink px-3 py-1.5 text-paper">Save reply</button>
      </form>
      <ul className="mt-3 text-sm text-ink/70">
        {canned.map((reply) => <li key={reply.id}>{reply.title}</li>)}
      </ul>
    </div>
  );
}
