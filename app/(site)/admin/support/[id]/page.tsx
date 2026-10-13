import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { supportReplyAction } from "@/lib/support-actions";
import { control, Panel } from "@/components/bits";
import { db } from "@/lib/db";
import { cannedReplies, ticketMessages, tickets, user } from "@/lib/db/schema";

export default function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={null}>
      <Body params={params} />
    </Suspense>
  );
}

async function Body({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [ticket] = await db.select().from(tickets).where(eq(tickets.id, id)).limit(1);
  if (!ticket) notFound();
  const messages = await db.select().from(ticketMessages).where(eq(ticketMessages.ticketId, id));
  const canned = await db.select().from(cannedReplies);
  const people = await db.select({ id: user.id, name: user.name }).from(user);
  return (
    <div>
      <h1 className="display text-4xl">{ticket.subject}</h1>
      <p className="mt-2 text-sm text-ink/60">{ticket.category} · {ticket.status} · {ticket.route}{ticket.assigneeUserId ? ` · assigned` : ""}</p>
      <div className="mt-4 space-y-2">
        {messages.map((message) => (
          <Panel key={message.id}>
            <p className="text-xs text-ink/50">{message.internal ? "Internal note" : "Reply"} · {people.find((person) => person.id === message.authorUserId)?.name ?? "Student"}</p>
            <p className="mt-1 whitespace-pre-wrap">{message.body}</p>
          </Panel>
        ))}
      </div>
      <form action={supportReplyAction} className="mt-4 space-y-2">
        <input type="hidden" name="ticketId" value={ticket.id} />
        <input type="hidden" name="back" value={`/admin/support/${ticket.id}`} />
        <label className="block text-sm">Reply<textarea name="body" className={`${control} mt-1 min-h-24`} /></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="internal" value="1" /> Internal note</label>
        {canned[0] ? <p className="text-xs text-ink/50">Canned: {canned.map((reply) => reply.title).join(", ")}</p> : null}
        <div className="flex flex-wrap gap-2">
          <button name="command" value="reply" className="rounded-full bg-ink px-3 py-1.5 text-sm text-paper">Send</button>
          <button name="command" value="resolve" className="rounded-full bg-clay px-3 py-1.5 text-sm text-white">Resolve</button>
        </div>
        <label className="block text-sm">Assign to user id<input name="assignee" className={control} /></label>
        <button name="command" value="assign" className="rounded-full bg-white px-3 py-1.5 text-sm ring-1 ring-line">Assign</button>
        <label className="block text-sm">Merge into ticket id<input name="targetId" className={control} /></label>
        <button name="command" value="merge" className="rounded-full bg-white px-3 py-1.5 text-sm ring-1 ring-line">Merge</button>
      </form>
      {ticket.status === "resolved" ? (
        <form action={supportReplyAction} className="mt-4 flex gap-2">
          <input type="hidden" name="ticketId" value={ticket.id} />
          <input type="hidden" name="command" value="csat" />
          <input type="hidden" name="back" value={`/admin/support/${ticket.id}`} />
          <label className="text-sm">How did we do?<input name="score" type="number" min={1} max={5} className={`${control} ml-2 w-20`} /></label>
          <button className="rounded-full bg-ink px-3 py-1.5 text-sm text-paper">Save rating</button>
        </form>
      ) : null}
    </div>
  );
}
