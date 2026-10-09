import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { control, Panel } from "@/components/bits";
import { requireActor } from "@/lib/actor";
import { db } from "@/lib/db";
import { ticketMessages, tickets } from "@/lib/db/schema";
import { supportReplyAction } from "@/lib/support-actions";

export default function StudentTicketPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p className="px-5 py-10">Loading ticket…</p>}>
      <Body params={params} />
    </Suspense>
  );
}

async function Body({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  const [ticket] = await db.select().from(tickets).where(eq(tickets.id, id)).limit(1);
  if (!ticket || ticket.userId !== actor.id) notFound();
  const messages = await db.select().from(ticketMessages).where(eq(ticketMessages.ticketId, id));
  const back = `/help/tickets/${ticket.id}`;
  return (
    <div className="mx-auto max-w-xl px-5 py-8">
      <p className="text-sm"><Link href="/help" className="text-clay">Help</Link></p>
      <h1 className="display mt-2 text-5xl">{ticket.subject}</h1>
      <p className="mt-2 text-sm text-ink/60">{ticket.status}</p>
      <div className="mt-4 space-y-2">
        {messages.filter((message) => !message.internal).map((message) => (
          <Panel key={message.id}>
            <p className="whitespace-pre-wrap text-sm">{message.body}</p>
          </Panel>
        ))}
      </div>
      {ticket.status === "resolved" ? (
        <form action={supportReplyAction} className="mt-6 flex flex-wrap items-end gap-2">
          <input type="hidden" name="ticketId" value={ticket.id} />
          <input type="hidden" name="command" value="csat" />
          <input type="hidden" name="back" value={back} />
          <label className="text-sm">How did we do?
            <input name="score" type="number" min={1} max={5} defaultValue={ticket.csatScore ?? 5} className={`${control} mt-1 w-24`} />
          </label>
          <button className="rounded-full bg-ink px-3 py-1.5 text-sm text-paper">Save rating</button>
        </form>
      ) : (
        <form action={supportReplyAction} className="mt-6 space-y-2">
          <input type="hidden" name="ticketId" value={ticket.id} />
          <input type="hidden" name="back" value={back} />
          <label className="block text-sm">Reply<textarea name="body" required className={`${control} mt-1 min-h-24`} /></label>
          <button className="rounded-full bg-ink px-3 py-1.5 text-sm text-paper">Send</button>
        </form>
      )}
      {ticket.csatScore ? <p className="mt-3 text-sm text-ink/60">You rated this {ticket.csatScore} out of 5.</p> : null}
    </div>
  );
}
